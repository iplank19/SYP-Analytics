// SYP Analytics - Intelligent Pricing Model
// Analyzes market data to provide pricing recommendations with risk assessment

// ============================================================
// PRICING MODEL CORE
// ============================================================

// Default model configuration
const PRICING_MODEL_CONFIG = {
  targetMargin: 25,              // Default target margin $/MBF
  riskTolerance: 'moderate',     // conservative, moderate, aggressive
  lengthPremiums: {              // Premium/discount vs RL composite
    '8': -15, '10': -5, '12': 0, '14': 10, '16': 25, '18': 15, '20': 10, 'RL': 0
  },
  freshnessWeight: 0.3,          // How much to weight recent data vs historical
  inventoryAgePenalty: 2,        // $/MBF per week of age
  promptShipPremium: 10,         // Premium for prompt availability
};

// Calculate comprehensive pricing analysis for a product
function analyzePricing(product, lengths = ['12', '14', '16']) {
  const analysis = {
    product,
    timestamp: new Date().toISOString(),
    market: {},
    supply: {},
    demand: {},
    inventory: {},
    recommendations: {},
    risks: []
  };

  // 1. MARKET ANALYSIS - RL prices and trends
  analysis.market = analyzeMarket(product, lengths);

  // 2. SUPPLY ANALYSIS - Mill quotes and availability
  analysis.supply = analyzeSupply(product, lengths);

  // 3. DEMAND ANALYSIS - Historical sales patterns
  analysis.demand = analyzeDemand(product, lengths);

  // 4. INVENTORY ANALYSIS - Current position and aging
  analysis.inventory = analyzeInventory(product, lengths);

  // 5. GENERATE RECOMMENDATIONS
  analysis.recommendations = generateRecommendations(analysis, lengths);

  // 6. RISK ASSESSMENT
  analysis.risks = assessRisks(analysis);

  return analysis;
}

// ============================================================
// MARKET ANALYSIS
// ============================================================

function analyzeMarket(product, lengths) {
  const rl = S.rl || [];
  const latest = rl.length ? rl[rl.length - 1] : null;
  const previous = rl.length > 1 ? rl[rl.length - 2] : null;

  const market = {
    currentRL: {},
    trend: {},
    lengthPrices: {},
    weekOverWeek: {},
    volatility: {}
  };

  // Current composite RL prices by region
  ['west', 'central', 'east'].forEach(region => {
    market.currentRL[region] = latest?.[region]?.[product] || 0;
    market.weekOverWeek[region] = previous?.[region]?.[product]
      ? market.currentRL[region] - previous[region][product]
      : 0;
  });

  // Length-specific prices from RL data
  lengths.forEach(len => {
    market.lengthPrices[len] = {};
    ['west', 'central', 'east'].forEach(region => {
      // Try specified_lengths first, then estimate from composite
      const specified = latest?.specified_lengths?.[region]?.[product]?.[len];
      if (specified) {
        market.lengthPrices[len][region] = specified;
      } else {
        // Estimate: composite + length premium
        const composite = market.currentRL[region] || 0;
        const premium = PRICING_MODEL_CONFIG.lengthPremiums[len] || 0;
        market.lengthPrices[len][region] = composite + premium;
      }
    });
  });

  // Calculate trend from last 4 weeks
  const recentRL = rl.slice(-4);
  if (recentRL.length >= 2) {
    ['west', 'central', 'east'].forEach(region => {
      const prices = recentRL.map(r => r[region]?.[product]).filter(p => p > 0);
      if (prices.length >= 2) {
        const first = prices[0];
        const last = prices[prices.length - 1];
        const change = last - first;
        const pctChange = first > 0 ? (change / first) * 100 : 0;
        market.trend[region] = {
          direction: change > 5 ? 'up' : change < -5 ? 'down' : 'flat',
          change,
          pctChange: Math.round(pctChange * 10) / 10
        };

        // Volatility (standard deviation)
        const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
        const variance = prices.reduce((a, p) => a + Math.pow(p - avg, 2), 0) / prices.length;
        market.volatility[region] = Math.round(Math.sqrt(variance));
      }
    });
  }

  return market;
}

// ============================================================
// SUPPLY ANALYSIS
// ============================================================

function analyzeSupply(product, lengths) {
  const quotes = (S.millQuotes || []).filter(q =>
    q.product && q.product.toLowerCase().includes(product.toLowerCase().replace('#', ''))
  );

  // Only consider quotes from last 14 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);
  const recentQuotes = quotes.filter(q => new Date(q.date) >= cutoff);

  const supply = {
    totalQuotes: recentQuotes.length,
    byLength: {},
    bestPrices: {},
    promptAvailability: {},
    millBreakdown: {}
  };

  lengths.forEach(len => {
    const lenQuotes = recentQuotes.filter(q =>
      q.length === len || q.length === len + "'" ||
      (len === 'RL' && (!q.length || q.length === 'RL'))
    );

    if (lenQuotes.length) {
      const prices = lenQuotes.map(q => q.price).filter(p => p > 0);
      const volumes = lenQuotes.map(q => q.volume || 0);
      const promptQuotes = lenQuotes.filter(q =>
        (q.ship_window || q.shipWindow || '').toLowerCase().includes('prompt') ||
        (q.ship_window || q.shipWindow || '').toLowerCase().includes('immediate')
      );

      supply.byLength[len] = {
        quoteCount: lenQuotes.length,
        minPrice: prices.length ? Math.min(...prices) : 0,
        maxPrice: prices.length ? Math.max(...prices) : 0,
        avgPrice: prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0,
        totalVolume: Math.round(volumes.reduce((a, b) => a + b, 0)),
        promptCount: promptQuotes.length
      };

      // Best price with mill info
      const bestQuote = lenQuotes.reduce((best, q) =>
        (!best || (q.price > 0 && q.price < best.price)) ? q : best, null
      );
      if (bestQuote) {
        supply.bestPrices[len] = {
          price: bestQuote.price,
          mill: bestQuote.mill || bestQuote.mill_name,
          ship: bestQuote.ship_window || bestQuote.shipWindow || 'unknown',
          volume: bestQuote.volume || 0
        };
      }

      supply.promptAvailability[len] = promptQuotes.length > 0;
    } else {
      supply.byLength[len] = { quoteCount: 0, minPrice: 0, maxPrice: 0, avgPrice: 0, totalVolume: 0, promptCount: 0 };
      supply.promptAvailability[len] = false;
    }
  });

  // Mill breakdown (top suppliers)
  const millCounts = {};
  recentQuotes.forEach(q => {
    const mill = q.mill || q.mill_name || 'Unknown';
    if (!millCounts[mill]) millCounts[mill] = { count: 0, avgPrice: 0, prices: [] };
    millCounts[mill].count++;
    if (q.price > 0) millCounts[mill].prices.push(q.price);
  });
  Object.keys(millCounts).forEach(mill => {
    const prices = millCounts[mill].prices;
    millCounts[mill].avgPrice = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0;
    delete millCounts[mill].prices;
  });
  supply.millBreakdown = millCounts;

  return supply;
}

// ============================================================
// DEMAND ANALYSIS
// ============================================================

function analyzeDemand(product, lengths) {
  const sells = S.sells.filter(s =>
    s.product && s.product.toLowerCase().includes(product.toLowerCase().replace('#', ''))
  );

  // Last 90 days of sales
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const recentSells = sells.filter(s => new Date(s.date) >= cutoff);

  const demand = {
    totalSells: recentSells.length,
    byLength: {},
    topCustomers: {},
    avgFreightByRegion: {},
    seasonality: {}
  };

  lengths.forEach(len => {
    const lenSells = recentSells.filter(s =>
      s.length === len || s.length === len + "'"
    );

    if (lenSells.length) {
      const prices = lenSells.map(s => s.price).filter(p => p > 0);
      const volumes = lenSells.map(s => s.volume || 0);
      const freights = lenSells.map(s => s.freight || 0);
      const totalVol = volumes.reduce((a, b) => a + b, 0);

      demand.byLength[len] = {
        orderCount: lenSells.length,
        totalVolume: Math.round(totalVol),
        avgPrice: prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0,
        avgVolPerOrder: lenSells.length ? Math.round(totalVol / lenSells.length) : 0,
        avgFreight: totalVol > 0 ? Math.round(freights.reduce((a, b) => a + b, 0) / totalVol) : 0,
        velocity: Math.round(totalVol / 13) // MBF per week (90 days = ~13 weeks)
      };

      // FOB calculation (price - freight/vol)
      let totalFOB = 0;
      lenSells.forEach(s => {
        const fobPrice = s.volume > 0 ? s.price - (s.freight || 0) / s.volume : s.price;
        totalFOB += fobPrice * (s.volume || 0);
      });
      demand.byLength[len].avgFOB = totalVol > 0 ? Math.round(totalFOB / totalVol) : 0;
    } else {
      demand.byLength[len] = { orderCount: 0, totalVolume: 0, avgPrice: 0, avgVolPerOrder: 0, avgFreight: 0, velocity: 0, avgFOB: 0 };
    }
  });

  // Top customers for this product
  const customerVol = {};
  recentSells.forEach(s => {
    const cust = s.customer || 'Unknown';
    if (!customerVol[cust]) customerVol[cust] = { volume: 0, orders: 0 };
    customerVol[cust].volume += (s.volume || 0);
    customerVol[cust].orders++;
  });
  // Sort by volume and take top 5
  demand.topCustomers = Object.entries(customerVol)
    .sort((a, b) => b[1].volume - a[1].volume)
    .slice(0, 5)
    .reduce((obj, [k, v]) => { obj[k] = v; return obj; }, {});

  return demand;
}

// ============================================================
// INVENTORY ANALYSIS
// ============================================================

function analyzeInventory(product, lengths) {
  const buys = S.buys.filter(b =>
    b.product && b.product.toLowerCase().includes(product.toLowerCase().replace('#', ''))
  );

  // Calculate sold volume per order
  const soldByOrder = {};
  S.sells.forEach(s => {
    const ord = String(s.orderNum || s.linkedPO || s.oc || '').trim();
    if (ord) soldByOrder[ord] = (soldByOrder[ord] || 0) + (s.volume || 0);
  });

  const inventory = {
    totalPosition: 0,
    byLength: {},
    aging: { fresh: 0, week: 0, twoWeek: 0, old: 0 },
    details: []
  };

  const now = Date.now();

  lengths.forEach(len => {
    inventory.byLength[len] = { available: 0, avgCost: 0, avgAge: 0, items: [] };
  });

  buys.forEach(b => {
    const ord = String(b.orderNum || b.po || '').trim();
    const sold = soldByOrder[ord] || 0;
    const available = (b.volume || 0) - sold;

    if (available > 0.5) {
      const age = Math.floor((now - new Date(b.date)) / (1000 * 60 * 60 * 24));
      const len = b.length || 'RL';

      inventory.totalPosition += available;

      // Age buckets
      if (age <= 7) inventory.aging.fresh += available;
      else if (age <= 14) inventory.aging.week += available;
      else if (age <= 30) inventory.aging.twoWeek += available;
      else inventory.aging.old += available;

      // By length (if it's one we care about)
      if (inventory.byLength[len]) {
        inventory.byLength[len].available += available;
        inventory.byLength[len].items.push({
          date: b.date,
          mill: b.mill,
          cost: b.price,
          available: Math.round(available * 100) / 100,
          age,
          region: b.region
        });
      }

      inventory.details.push({
        length: len,
        date: b.date,
        mill: b.mill,
        cost: b.price,
        available: Math.round(available * 100) / 100,
        age,
        region: b.region
      });
    }
  });

  // Calculate averages
  lengths.forEach(len => {
    const items = inventory.byLength[len].items;
    if (items.length) {
      const totalCost = items.reduce((a, i) => a + i.cost * i.available, 0);
      const totalVol = items.reduce((a, i) => a + i.available, 0);
      const totalAge = items.reduce((a, i) => a + i.age * i.available, 0);
      inventory.byLength[len].avgCost = totalVol > 0 ? Math.round(totalCost / totalVol) : 0;
      inventory.byLength[len].avgAge = totalVol > 0 ? Math.round(totalAge / totalVol) : 0;
    }
  });

  return inventory;
}

// ============================================================
// RECOMMENDATION ENGINE
// ============================================================

function generateRecommendations(analysis, lengths) {
  const recs = {};
  const config = PRICING_MODEL_CONFIG;

  lengths.forEach(len => {
    const market = analysis.market.lengthPrices[len] || {};
    const supply = analysis.supply.byLength[len] || {};
    const demand = analysis.demand.byLength[len] || {};
    const inv = analysis.inventory.byLength[len] || {};

    // Base price calculation
    const marketAvg = (market.west + market.central + market.east) / 3 || 0;
    const supplyAvg = supply.avgPrice || 0;
    const demandAvg = demand.avgFOB || demand.avgPrice || 0;
    const invCost = inv.avgCost || 0;

    // Weighted price estimate
    let basePrice = 0;
    let weights = 0;
    if (marketAvg > 0) { basePrice += marketAvg * 0.25; weights += 0.25; }
    if (supplyAvg > 0) { basePrice += supplyAvg * 0.35; weights += 0.35; }
    if (demandAvg > 0) { basePrice += demandAvg * 0.25; weights += 0.25; }
    if (invCost > 0) { basePrice += invCost * 0.15; weights += 0.15; }
    basePrice = weights > 0 ? basePrice / weights : marketAvg;

    // Adjustments
    let adjustments = [];
    let totalAdj = 0;

    // Supply/demand imbalance
    if (supply.totalVolume > 0 && demand.velocity > 0) {
      const weeksOfSupply = supply.totalVolume / demand.velocity;
      if (weeksOfSupply > 4) {
        const adj = -10; // Oversupply, discount
        adjustments.push({ reason: 'Oversupply in market', amount: adj });
        totalAdj += adj;
      } else if (weeksOfSupply < 2) {
        const adj = 15; // Tight supply, premium
        adjustments.push({ reason: 'Tight supply', amount: adj });
        totalAdj += adj;
      }
    }

    // Prompt availability premium
    if (supply.promptAvailability?.[len] || supply.promptCount > 0) {
      const adj = config.promptShipPremium;
      adjustments.push({ reason: 'Prompt ship available', amount: adj });
      totalAdj += adj;
    }

    // Inventory aging penalty
    if (inv.avgAge > 14) {
      const weeks = Math.floor(inv.avgAge / 7);
      const adj = -weeks * config.inventoryAgePenalty;
      adjustments.push({ reason: `Aging inventory (${inv.avgAge}d avg)`, amount: adj });
      totalAdj += adj;
    }

    // Market trend adjustment
    const trend = analysis.market.trend?.central || analysis.market.trend?.west;
    if (trend) {
      if (trend.direction === 'up') {
        const adj = 5;
        adjustments.push({ reason: 'Market trending up', amount: adj });
        totalAdj += adj;
      } else if (trend.direction === 'down') {
        const adj = -5;
        adjustments.push({ reason: 'Market trending down', amount: adj });
        totalAdj += adj;
      }
    }

    const recommendedPrice = Math.round(basePrice + totalAdj);
    const bestBuyPrice = supply.bestPrices?.[len]?.price || supply.minPrice || 0;
    const potentialMargin = bestBuyPrice > 0 ? recommendedPrice - bestBuyPrice : 0;

    // Action recommendation
    let action = 'hold';
    let confidence = 'medium';
    let rationale = '';

    if (inv.available > 0) {
      // Have inventory - should we sell?
      if (potentialMargin >= config.targetMargin) {
        action = 'sell';
        confidence = potentialMargin >= config.targetMargin * 1.5 ? 'high' : 'medium';
        rationale = `Margin of $${potentialMargin}/MBF exceeds target. Current inventory cost: $${invCost}`;
      } else if (inv.avgAge > 21) {
        action = 'sell-discount';
        confidence = 'high';
        rationale = `Inventory aging at ${inv.avgAge} days. Consider discounting to move.`;
      } else {
        action = 'hold';
        rationale = `Margin of $${potentialMargin}/MBF below target. Hold for better pricing.`;
      }
    } else {
      // No inventory - should we buy?
      if (bestBuyPrice > 0 && bestBuyPrice < marketAvg - 10) {
        action = 'buy';
        confidence = 'high';
        rationale = `Best buy at $${bestBuyPrice} is $${Math.round(marketAvg - bestBuyPrice)} below market.`;
      } else if (demand.velocity > 5) {
        action = 'buy-cautious';
        confidence = 'medium';
        rationale = `Good demand velocity (${demand.velocity} MBF/wk) but pricing at market.`;
      } else {
        action = 'wait';
        rationale = `No compelling buy opportunity. Market price: $${Math.round(marketAvg)}`;
      }
    }

    recs[len] = {
      basePrice: Math.round(basePrice),
      adjustments,
      recommendedPrice,
      targetSellPrice: recommendedPrice,
      targetBuyPrice: bestBuyPrice > 0 ? bestBuyPrice : Math.round(marketAvg - config.targetMargin),
      potentialMargin,
      action,
      confidence,
      rationale,
      // Quick reference
      market: Math.round(marketAvg),
      bestBuy: bestBuyPrice,
      invCost: invCost,
      invAvailable: Math.round(inv.available * 100) / 100
    };
  });

  return recs;
}

// ============================================================
// RISK ASSESSMENT
// ============================================================

function assessRisks(analysis) {
  const risks = [];

  // Market volatility risk
  const volatilities = Object.values(analysis.market.volatility || {});
  const avgVolatility = volatilities.length ? volatilities.reduce((a, b) => a + b, 0) / volatilities.length : 0;
  if (avgVolatility > 15) {
    risks.push({
      type: 'market',
      severity: avgVolatility > 25 ? 'high' : 'medium',
      description: `High market volatility ($${Math.round(avgVolatility)} std dev)`,
      mitigation: 'Consider smaller position sizes and tighter stops'
    });
  }

  // Inventory aging risk
  const oldInventory = analysis.inventory.aging.old + analysis.inventory.aging.twoWeek;
  if (oldInventory > 50) {
    risks.push({
      type: 'inventory',
      severity: oldInventory > 100 ? 'high' : 'medium',
      description: `${Math.round(oldInventory)} MBF of aged inventory (14+ days)`,
      mitigation: 'Prioritize selling aged inventory, consider discounts'
    });
  }

  // Concentration risk (single mill dependency)
  const millBreakdown = analysis.supply.millBreakdown || {};
  const millCounts = Object.values(millBreakdown).map(m => m.count);
  const totalQuotes = millCounts.reduce((a, b) => a + b, 0);
  if (totalQuotes > 0) {
    const maxMill = Math.max(...millCounts);
    if (maxMill / totalQuotes > 0.5) {
      const topMill = Object.entries(millBreakdown).find(([_, v]) => v.count === maxMill)?.[0];
      risks.push({
        type: 'concentration',
        severity: 'medium',
        description: `High supplier concentration: ${topMill} has ${Math.round(maxMill / totalQuotes * 100)}% of quotes`,
        mitigation: 'Diversify supply sources'
      });
    }
  }

  // Demand risk (low velocity)
  const lengths = Object.keys(analysis.demand.byLength || {});
  lengths.forEach(len => {
    const d = analysis.demand.byLength[len];
    if (d && d.velocity < 3 && analysis.inventory.byLength?.[len]?.available > 20) {
      risks.push({
        type: 'demand',
        severity: 'medium',
        description: `Low demand velocity for ${len}' (${d.velocity} MBF/wk) with ${Math.round(analysis.inventory.byLength[len].available)} MBF in stock`,
        mitigation: 'Reduce buying, focus on selling existing inventory'
      });
    }
  });

  // Market direction risk
  const trends = Object.values(analysis.market.trend || {});
  const downTrends = trends.filter(t => t.direction === 'down').length;
  if (downTrends >= 2) {
    risks.push({
      type: 'market',
      severity: 'medium',
      description: 'Market trending down across multiple regions',
      mitigation: 'Reduce long positions, consider hedging with futures'
    });
  }

  return risks;
}

// ============================================================
// UI RENDERING
// ============================================================

function renderPricingModel() {
  const c = document.getElementById('content');
  if (!c) return;

  // Default to 2x4#2 with 12/14/16 lengths
  const product = S.pricingModelProduct || '2x4#2';
  const lengths = S.pricingModelLengths || ['12', '14', '16'];

  // Run analysis
  const analysis = analyzePricing(product, lengths);

  c.innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <div class="card-header">
        <span class="card-title">🧠 INTELLIGENT PRICING MODEL</span>
        <div style="display:flex;gap:8px;align-items:center">
          <select id="pm-product" onchange="S.pricingModelProduct=this.value;renderPricingModel()" style="padding:4px 8px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)">
            ${PRODUCTS.map(p => `<option value="${p}" ${p === product ? 'selected' : ''}>${p}</option>`).join('')}
          </select>
          <button class="btn btn-default" style="font-size:10px;padding:4px 8px" onclick="renderPricingModel()">↻ Refresh</button>
        </div>
      </div>
      <div class="card-body" style="padding:8px 16px">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span style="font-size:11px;color:var(--muted)">Lengths:</span>
          ${['8', '10', '12', '14', '16', '18', '20'].map(l => `
            <label style="font-size:11px;display:flex;align-items:center;gap:4px;cursor:pointer">
              <input type="checkbox" ${lengths.includes(l) ? 'checked' : ''} onchange="togglePricingLength('${l}')">
              ${l}'
            </label>
          `).join('')}
        </div>
      </div>
    </div>

    <!-- RECOMMENDATIONS CARDS -->
    <div class="grid-3" style="gap:16px;margin-bottom:16px">
      ${lengths.map(len => renderRecommendationCard(len, analysis)).join('')}
    </div>

    <!-- MARKET & SUPPLY ANALYSIS -->
    <div class="grid-2" style="gap:16px;margin-bottom:16px">
      ${renderMarketCard(analysis)}
      ${renderSupplyCard(analysis, lengths)}
    </div>

    <!-- DEMAND & INVENTORY -->
    <div class="grid-2" style="gap:16px;margin-bottom:16px">
      ${renderDemandCard(analysis, lengths)}
      ${renderInventoryCard(analysis, lengths)}
    </div>

    <!-- RISK ASSESSMENT -->
    ${renderRiskCard(analysis)}
  `;
}

function renderRecommendationCard(len, analysis) {
  const rec = analysis.recommendations[len] || {};
  const actionColors = {
    'buy': 'var(--positive)',
    'buy-cautious': 'var(--warn)',
    'sell': 'var(--positive)',
    'sell-discount': 'var(--warn)',
    'hold': 'var(--muted)',
    'wait': 'var(--muted)'
  };
  const actionLabels = {
    'buy': '🟢 BUY',
    'buy-cautious': '🟡 BUY (Cautious)',
    'sell': '🟢 SELL',
    'sell-discount': '🟡 SELL (Discount)',
    'hold': '⚪ HOLD',
    'wait': '⚪ WAIT'
  };

  const confidenceStars = rec.confidence === 'high' ? '★★★' : rec.confidence === 'medium' ? '★★☆' : '★☆☆';

  return `
    <div class="card">
      <div class="card-header" style="background:${actionColors[rec.action] || 'var(--panel)'};padding:8px 12px">
        <span class="card-title" style="color:var(--bg);font-size:14px">${len}' ${actionLabels[rec.action] || rec.action}</span>
        <span style="color:var(--bg);font-size:12px" title="Confidence">${confidenceStars}</span>
      </div>
      <div class="card-body" style="padding:12px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
          <div style="text-align:center;padding:8px;background:var(--bg);border-radius:var(--radius)">
            <div style="font-size:10px;color:var(--muted)">Target Sell</div>
            <div style="font-size:18px;font-weight:700;color:var(--positive)">$${rec.recommendedPrice || '—'}</div>
          </div>
          <div style="text-align:center;padding:8px;background:var(--bg);border-radius:var(--radius)">
            <div style="font-size:10px;color:var(--muted)">Best Buy</div>
            <div style="font-size:18px;font-weight:700;color:var(--accent)">$${rec.bestBuy || '—'}</div>
          </div>
        </div>

        <div style="margin-bottom:12px;padding:8px;background:var(--bg);border-radius:var(--radius)">
          <div style="font-size:10px;color:var(--muted);margin-bottom:4px">Potential Margin</div>
          <div style="font-size:16px;font-weight:600;color:${rec.potentialMargin >= 25 ? 'var(--positive)' : rec.potentialMargin >= 15 ? 'var(--warn)' : 'var(--negative)'}">
            $${rec.potentialMargin || 0}/MBF
          </div>
        </div>

        <div style="font-size:11px;color:var(--text);margin-bottom:8px">${rec.rationale || ''}</div>

        ${rec.adjustments && rec.adjustments.length ? `
          <div style="font-size:10px;color:var(--muted);border-top:1px solid var(--border);padding-top:8px;margin-top:8px">
            <div style="margin-bottom:4px">Price Adjustments:</div>
            ${rec.adjustments.map(a => `
              <div style="display:flex;justify-content:space-between">
                <span>${a.reason}</span>
                <span style="color:${a.amount >= 0 ? 'var(--positive)' : 'var(--negative)'}">${a.amount >= 0 ? '+' : ''}$${a.amount}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <div style="font-size:10px;color:var(--muted);border-top:1px solid var(--border);padding-top:8px;margin-top:8px">
          <div style="display:flex;justify-content:space-between"><span>Market Avg:</span><span>$${rec.market || '—'}</span></div>
          <div style="display:flex;justify-content:space-between"><span>Your Cost:</span><span>$${rec.invCost || '—'}</span></div>
          <div style="display:flex;justify-content:space-between"><span>In Stock:</span><span>${rec.invAvailable || 0} MBF</span></div>
        </div>
      </div>
    </div>
  `;
}

function renderMarketCard(analysis) {
  const m = analysis.market;
  return `
    <div class="card">
      <div class="card-header"><span class="card-title">📊 MARKET ANALYSIS</span></div>
      <div class="card-body">
        <table style="width:100%;font-size:11px;border-collapse:collapse">
          <thead>
            <tr style="border-bottom:1px solid var(--border)">
              <th style="text-align:left;padding:4px">Region</th>
              <th style="text-align:right;padding:4px">RL Price</th>
              <th style="text-align:right;padding:4px">W/W Chg</th>
              <th style="text-align:right;padding:4px">Trend</th>
              <th style="text-align:right;padding:4px">Volatility</th>
            </tr>
          </thead>
          <tbody>
            ${['west', 'central', 'east'].map(r => `
              <tr>
                <td style="padding:4px;text-transform:capitalize">${r}</td>
                <td style="text-align:right;padding:4px;font-weight:600">$${m.currentRL[r] || '—'}</td>
                <td style="text-align:right;padding:4px;color:${(m.weekOverWeek[r] || 0) >= 0 ? 'var(--positive)' : 'var(--negative)'}">
                  ${(m.weekOverWeek[r] || 0) >= 0 ? '+' : ''}$${m.weekOverWeek[r] || 0}
                </td>
                <td style="text-align:right;padding:4px">
                  ${m.trend[r]?.direction === 'up' ? '📈' : m.trend[r]?.direction === 'down' ? '📉' : '➡️'}
                  ${m.trend[r]?.pctChange ? `${m.trend[r].pctChange}%` : ''}
                </td>
                <td style="text-align:right;padding:4px;color:var(--muted)">±$${m.volatility[r] || 0}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderSupplyCard(analysis, lengths) {
  const s = analysis.supply;
  return `
    <div class="card">
      <div class="card-header"><span class="card-title">🏭 SUPPLY ANALYSIS</span><span style="font-size:10px;color:var(--muted)">${s.totalQuotes} quotes (14d)</span></div>
      <div class="card-body">
        <table style="width:100%;font-size:11px;border-collapse:collapse">
          <thead>
            <tr style="border-bottom:1px solid var(--border)">
              <th style="text-align:left;padding:4px">Length</th>
              <th style="text-align:right;padding:4px">Min</th>
              <th style="text-align:right;padding:4px">Avg</th>
              <th style="text-align:right;padding:4px">Max</th>
              <th style="text-align:right;padding:4px">Avail</th>
              <th style="text-align:center;padding:4px">Prompt</th>
            </tr>
          </thead>
          <tbody>
            ${lengths.map(len => {
              const d = s.byLength[len] || {};
              return `
                <tr>
                  <td style="padding:4px">${len}'</td>
                  <td style="text-align:right;padding:4px;color:var(--positive)">$${d.minPrice || '—'}</td>
                  <td style="text-align:right;padding:4px">$${d.avgPrice || '—'}</td>
                  <td style="text-align:right;padding:4px;color:var(--negative)">$${d.maxPrice || '—'}</td>
                  <td style="text-align:right;padding:4px">${d.totalVolume || 0} MBF</td>
                  <td style="text-align:center;padding:4px">${d.promptCount > 0 ? '✅' : '❌'}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        ${s.bestPrices && Object.keys(s.bestPrices).length ? `
          <div style="margin-top:12px;padding-top:8px;border-top:1px solid var(--border);font-size:10px">
            <div style="color:var(--muted);margin-bottom:4px">Best Prices:</div>
            ${Object.entries(s.bestPrices).map(([len, bp]) => `
              <div>${len}': <strong style="color:var(--positive)">$${bp.price}</strong> @ ${bp.mill} (${bp.ship})</div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function renderDemandCard(analysis, lengths) {
  const d = analysis.demand;
  return `
    <div class="card">
      <div class="card-header"><span class="card-title">📈 DEMAND ANALYSIS</span><span style="font-size:10px;color:var(--muted)">${d.totalSells} orders (90d)</span></div>
      <div class="card-body">
        <table style="width:100%;font-size:11px;border-collapse:collapse">
          <thead>
            <tr style="border-bottom:1px solid var(--border)">
              <th style="text-align:left;padding:4px">Length</th>
              <th style="text-align:right;padding:4px">Orders</th>
              <th style="text-align:right;padding:4px">Volume</th>
              <th style="text-align:right;padding:4px">Avg FOB</th>
              <th style="text-align:right;padding:4px">Velocity</th>
            </tr>
          </thead>
          <tbody>
            ${lengths.map(len => {
              const dd = d.byLength[len] || {};
              return `
                <tr>
                  <td style="padding:4px">${len}'</td>
                  <td style="text-align:right;padding:4px">${dd.orderCount || 0}</td>
                  <td style="text-align:right;padding:4px">${dd.totalVolume || 0} MBF</td>
                  <td style="text-align:right;padding:4px;font-weight:600">$${dd.avgFOB || dd.avgPrice || '—'}</td>
                  <td style="text-align:right;padding:4px;color:${(dd.velocity || 0) >= 5 ? 'var(--positive)' : 'var(--muted)'}">
                    ${dd.velocity || 0} MBF/wk
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        ${d.topCustomers && Object.keys(d.topCustomers).length ? `
          <div style="margin-top:12px;padding-top:8px;border-top:1px solid var(--border);font-size:10px">
            <div style="color:var(--muted);margin-bottom:4px">Top Customers:</div>
            ${Object.entries(d.topCustomers).slice(0, 3).map(([cust, data]) => `
              <div>${cust}: ${Math.round(data.volume)} MBF (${data.orders} orders)</div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function renderInventoryCard(analysis, lengths) {
  const inv = analysis.inventory;
  return `
    <div class="card">
      <div class="card-header"><span class="card-title">📦 INVENTORY POSITION</span><span style="font-size:10px;color:var(--muted)">${Math.round(inv.totalPosition)} MBF total</span></div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px">
          <div style="text-align:center;padding:8px;background:var(--positive);border-radius:var(--radius)">
            <div style="font-size:9px;color:var(--bg)">Fresh (0-7d)</div>
            <div style="font-size:14px;font-weight:700;color:var(--bg)">${Math.round(inv.aging.fresh)}</div>
          </div>
          <div style="text-align:center;padding:8px;background:var(--accent);border-radius:var(--radius)">
            <div style="font-size:9px;color:var(--bg)">Week (8-14d)</div>
            <div style="font-size:14px;font-weight:700;color:var(--bg)">${Math.round(inv.aging.week)}</div>
          </div>
          <div style="text-align:center;padding:8px;background:var(--warn);border-radius:var(--radius)">
            <div style="font-size:9px;color:var(--bg)">2-Week (15-30d)</div>
            <div style="font-size:14px;font-weight:700;color:var(--bg)">${Math.round(inv.aging.twoWeek)}</div>
          </div>
          <div style="text-align:center;padding:8px;background:var(--negative);border-radius:var(--radius)">
            <div style="font-size:9px;color:var(--bg)">Old (30d+)</div>
            <div style="font-size:14px;font-weight:700;color:var(--bg)">${Math.round(inv.aging.old)}</div>
          </div>
        </div>

        <table style="width:100%;font-size:11px;border-collapse:collapse">
          <thead>
            <tr style="border-bottom:1px solid var(--border)">
              <th style="text-align:left;padding:4px">Length</th>
              <th style="text-align:right;padding:4px">Available</th>
              <th style="text-align:right;padding:4px">Avg Cost</th>
              <th style="text-align:right;padding:4px">Avg Age</th>
            </tr>
          </thead>
          <tbody>
            ${lengths.map(len => {
              const d = inv.byLength[len] || {};
              return `
                <tr>
                  <td style="padding:4px">${len}'</td>
                  <td style="text-align:right;padding:4px;font-weight:600">${Math.round((d.available || 0) * 100) / 100} MBF</td>
                  <td style="text-align:right;padding:4px">$${d.avgCost || '—'}</td>
                  <td style="text-align:right;padding:4px;color:${(d.avgAge || 0) > 14 ? 'var(--warn)' : 'var(--muted)'}">
                    ${d.avgAge || 0}d
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderRiskCard(analysis) {
  const risks = analysis.risks || [];
  if (!risks.length) {
    return `
      <div class="card">
        <div class="card-header"><span class="card-title">⚠️ RISK ASSESSMENT</span></div>
        <div class="card-body" style="text-align:center;color:var(--positive);padding:20px">
          ✅ No significant risks identified
        </div>
      </div>
    `;
  }

  return `
    <div class="card">
      <div class="card-header"><span class="card-title">⚠️ RISK ASSESSMENT</span><span style="font-size:10px;color:var(--warn)">${risks.length} risk(s) identified</span></div>
      <div class="card-body">
        ${risks.map(r => `
          <div style="padding:8px;margin-bottom:8px;background:var(--bg);border-radius:var(--radius);border-left:3px solid ${r.severity === 'high' ? 'var(--negative)' : 'var(--warn)'}">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
              <span style="font-size:11px;font-weight:600">${r.description}</span>
              <span style="font-size:9px;padding:2px 6px;background:${r.severity === 'high' ? 'var(--negative)' : 'var(--warn)'};color:var(--bg);border-radius:var(--radius)">${r.severity.toUpperCase()}</span>
            </div>
            <div style="font-size:10px;color:var(--muted)">💡 ${r.mitigation}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function togglePricingLength(len) {
  const lengths = S.pricingModelLengths || ['12', '14', '16'];
  const idx = lengths.indexOf(len);
  if (idx >= 0) {
    lengths.splice(idx, 1);
  } else {
    lengths.push(len);
    lengths.sort((a, b) => parseInt(a) - parseInt(b));
  }
  S.pricingModelLengths = lengths;
  renderPricingModel();
}
