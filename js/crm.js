// SYP Analytics - CRM Functions
async function loadCRMData(){
  try{
    // Each trader sees only their own CRM data
    const trader=S.trader;
    const status=S.crmStatusFilter||'';
    const params=new URLSearchParams();
    if(trader && trader!=='Admin')params.set('trader',trader);
    if(status&&status!=='all')params.set('status',status);

    const traderParam=trader && trader!=='Admin'?'?trader='+trader:'';

    const[prospectsResult,dashResult,customersResult,millsResult]=await Promise.allSettled([
      fetch('/api/crm/prospects?'+params),
      fetch('/api/crm/dashboard?trader='+trader),
      fetch('/api/crm/customers'+traderParam),
      fetch('/api/crm/mills'+traderParam)
    ]);
    // Extract successful responses, use defaults for failures
    if(prospectsResult.status==='fulfilled'){
      S.crmProspects=await prospectsResult.value.json();
    }else{S.crmProspects=S.crmProspects||[];console.warn('CRM prospects fetch failed:',prospectsResult.reason)}
    if(dashResult.status==='fulfilled'){
      const dash=await dashResult.value.json();
      S.crmStats=dash.stats||{};
      S.crmOverdue=dash.overdue||[];
      S.crmRecent=dash.recent_touches||[];
      S.crmStaleCritical=dash.stale_critical||[];
      S.crmStaleWarning=dash.stale_warning||[];
      S.crmNeverContacted=dash.never_contacted||[];
    }else{console.warn('CRM dashboard fetch failed:',dashResult.reason)}
    // Load customers and mills from cloud DB, merging with in-memory data
    const serverCustomers=customersResult.status==='fulfilled'?await customersResult.value.json():[];
    const serverMills=millsResult.status==='fulfilled'?await millsResult.value.json():[];
    if(customersResult.status==='rejected')console.warn('CRM customers fetch failed:',customersResult.reason);
    if(millsResult.status==='rejected')console.warn('CRM mills fetch failed:',millsResult.reason);
    // Parse locations if stored as JSON string
    serverCustomers.forEach(c=>{if(typeof c.locations==='string')try{c.locations=JSON.parse(c.locations)}catch(e){}});
    serverMills.forEach(m=>{if(typeof m.products==='string')try{m.products=JSON.parse(m.products)}catch(e){}});
    // Merge: use server data as base, add any in-memory entries not on server
    const serverCustNames=new Set(serverCustomers.map(c=>c.name));
    const serverMillNames=new Set(serverMills.map(m=>m.name));
    const extraCusts=(S.customers||[]).filter(c=>c.name&&!serverCustNames.has(c.name));
    const extraMills=(S.mills||[]).filter(m=>m.name&&!serverMillNames.has(m.name));
    S.customers=serverCustomers.concat(extraCusts);
    S.mills=serverMills.concat(extraMills);
    // Sync any missing entries back to server
    if(extraCusts.length&&typeof syncCustomersToServer==='function')syncCustomersToServer(extraCusts);
    if(extraMills.length&&typeof syncMillsToServer==='function')syncMillsToServer(extraMills);
    render();
  }catch(e){console.error('CRM load error:',e)}
}

// Alias for backwards compatibility
async function loadCRMProspects(){return loadCRMData()}

async function resetAllCRMData(){
  if(!confirm('This will DELETE ALL CRM data (prospects, customers, mills) for ALL traders. This cannot be undone. Continue?'))return;
  if(!confirm('Are you SURE? Type "RESET" in the next prompt to confirm.'))return;
  const confirmation=prompt('Type RESET to confirm deletion of all CRM data:');
  if(confirmation!=='RESET'){alert('Cancelled.');return;}
  try{
    const res=await fetch('/api/crm/wipe-all',{method:'POST'});
    const result=await res.json();
    alert(result.message||'All CRM data wiped');
    S.crmProspects=[];S.customers=[];S.mills=[];
    loadCRMData();
  }catch(e){alert('Error: '+e.message)}
}

async function seedMockData(){
  if(!confirm('This will replace all CRM data with test data. Continue?'))return;
  try{
    const res=await fetch('/api/crm/seed-mock',{method:'POST'});
    const result=await res.json();
    alert(`Mock data loaded: ${result.prospects_created} prospects, ${result.touches_created} touches`);
    loadCRMProspects();
  }catch(e){alert('Error seeding mock data: '+e.message)}
}

function showProspectModal(p=null){
  document.getElementById('modal').innerHTML=`<div class="modal-overlay" onclick="closeModal()"><div class="modal" onclick="event.stopPropagation()">
    <div class="modal-header"><span class="modal-title info">${p?'EDIT':'NEW'} PROSPECT</span><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="form-group full"><label class="form-label">Company Name *</label><input type="text" id="p-company" value="${p?.company_name||''}" required></div>
        <div class="form-group"><label class="form-label">Contact Name</label><input type="text" id="p-contact" value="${p?.contact_name||''}"></div>
        <div class="form-group"><label class="form-label">Phone</label><input type="tel" id="p-phone" value="${p?.phone||''}"></div>
        <div class="form-group"><label class="form-label">Email</label><input type="email" id="p-email" value="${p?.email||''}"></div>
        <div class="form-group"><label class="form-label">Status</label>
          <select id="p-status">
            <option value="prospect" ${(p?.status||'prospect')==='prospect'?'selected':''}>Prospect</option>
            <option value="qualified" ${p?.status==='qualified'?'selected':''}>Qualified</option>
            <option value="converted" ${p?.status==='converted'?'selected':''}>Converted</option>
            <option value="lost" ${p?.status==='lost'?'selected':''}>Lost</option>
          </select>
        </div>
        <div class="form-group full"><label class="form-label">Address</label><input type="text" id="p-address" value="${p?.address||''}"></div>
        <div class="form-group"><label class="form-label">Source</label><input type="text" id="p-source" value="${p?.source||''}" placeholder="How did you find them?"></div>
        <div class="form-group full"><label class="form-label">Notes</label><textarea id="p-notes" rows="3">${p?.notes||''}</textarea></div>
      </div>
    </div>
    <div class="modal-footer">
      ${p?`<button class="btn btn-danger" onclick="deleteProspect(${p.id})">Delete</button>`:''}
      <button class="btn btn-default" onclick="closeModal()">Cancel</button>
      <button class="btn btn-info" onclick="saveProspect(${p?.id||'null'})">${p?'Update':'Create'} Prospect</button>
    </div>
  </div></div>`;
}

async function saveProspect(id){
  const data={
    company_name:document.getElementById('p-company').value,
    contact_name:document.getElementById('p-contact').value,
    phone:document.getElementById('p-phone').value,
    email:document.getElementById('p-email').value,
    address:document.getElementById('p-address').value,
    status:document.getElementById('p-status').value,
    source:document.getElementById('p-source').value,
    notes:document.getElementById('p-notes').value,
    trader:S.trader==='Admin'?'':S.trader
  };
  if(!data.company_name){alert('Company name required');return}
  try{
    const url=id?'/api/crm/prospects/'+id:'/api/crm/prospects';
    await fetch(url,{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    closeModal();loadCRMProspects();
  }catch(e){alert('Error saving prospect')}
}

async function deleteProspect(id){
  if(!confirm('Delete this prospect?'))return;
  try{
    await fetch('/api/crm/prospects/'+id,{method:'DELETE'});
    closeModal();loadCRMProspects();
  }catch(e){alert('Error deleting prospect')}
}

async function viewProspect(id){
  try{
    const res=await fetch('/api/crm/prospects/'+id);
    const p=await res.json();
    document.getElementById('modal').innerHTML=`<div class="modal-overlay" onclick="closeModal()"><div class="modal wide" onclick="event.stopPropagation()">
      <div class="modal-header">
        <span class="modal-title info">${p.company_name}</span>
        <button class="modal-close" onclick="closeModal()">×</button>
      </div>
      <div class="modal-body">
        <div class="grid-2" style="gap:20px">
          <div>
            <h4 style="color:var(--accent);margin-bottom:12px">Contact Info</h4>
            <div style="font-size:12px;line-height:1.8">
              <div><strong>Contact:</strong> ${p.contact_name||'—'}</div>
              <div><strong>Phone:</strong> ${p.phone||'—'}</div>
              <div><strong>Email:</strong> ${p.email||'—'}</div>
              <div><strong>Address:</strong> ${p.address||'—'}</div>
              <div><strong>Status:</strong> <span class="badge badge-pending">${p.status}</span></div>
              <div><strong>Source:</strong> ${p.source||'—'}</div>
              ${p.notes?`<div style="margin-top:8px"><strong>Notes:</strong><div style="background:var(--bg);padding:8px;margin-top:4px;border-radius:4px">${p.notes}</div></div>`:''}
            </div>
          </div>
          <div>
            <h4 style="color:var(--accent);margin-bottom:12px">Activity Timeline (${(p.touches||[]).length})</h4>
            <div style="max-height:300px;overflow-y:auto">
              ${(p.touches||[]).length?p.touches.map(t=>{
                const icons={call:'📞',email:'✉️',meeting:'🤝',note:'📝'};
                return`<div class="timeline-item">
                  <div class="timeline-line"></div>
                  <div class="timeline-icon timeline-icon-${t.touch_type}">${icons[t.touch_type]||'💬'}</div>
                  <div class="timeline-content">
                    <div class="timeline-header">
                      <span class="timeline-type">${t.touch_type}</span>
                      <span class="timeline-date">${new Date(t.created_at).toLocaleDateString()}</span>
                    </div>
                    <div class="timeline-notes">${t.notes||'No notes'}</div>
                    ${t.products_discussed?`<div class="timeline-products">Products: ${t.products_discussed}</div>`:''}
                    ${t.follow_up_date?`<div class="timeline-followup">Follow-up: ${t.follow_up_date}</div>`:''}
                  </div>
                </div>`;
              }).join(''):'<div class="empty-state">No touches yet</div>'}
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-default" onclick="showProspectModal(${JSON.stringify(p).replace(/"/g,'&quot;')})">Edit</button>
        <button class="btn btn-info" onclick="closeModal();showTouchModal(${p.id})">Log Touch</button>
        ${p.status!=='converted'?`<button class="btn btn-success" onclick="convertProspect(${p.id})">Convert to Customer</button>`:''}
      </div>
    </div></div>`;
  }catch(e){alert('Error loading prospect')}
}

function showTouchModal(prospectId){
  document.getElementById('modal').innerHTML=`<div class="modal-overlay" onclick="closeModal()"><div class="modal" onclick="event.stopPropagation()">
    <div class="modal-header"><span class="modal-title positive">LOG CONTACT TOUCH</span><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="form-group full">
          <label class="form-label">Touch Type *</label>
          <div style="display:flex;gap:8px">
            <button class="btn btn-info" id="tt-call" onclick="selectTouchType('call')">📞 Call</button>
            <button class="btn btn-default" id="tt-email" onclick="selectTouchType('email')">✉️ Email</button>
            <button class="btn btn-default" id="tt-meeting" onclick="selectTouchType('meeting')">🤝 Meeting</button>
            <button class="btn btn-default" id="tt-note" onclick="selectTouchType('note')">📝 Note</button>
          </div>
        </div>
        <div class="form-group full"><label class="form-label">Notes *</label><textarea id="t-notes" rows="4" placeholder="What was discussed?"></textarea></div>
        <div class="form-group full">
          <label class="form-label">Products Discussed</label>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${PRODUCTS.map(p=>`<label style="display:flex;align-items:center;gap:4px;padding:4px 8px;background:var(--bg);border-radius:4px;font-size:10px;cursor:pointer"><input type="checkbox" value="${p}" class="prod-check">${p}</label>`).join('')}
          </div>
        </div>
        <div class="form-group"><label class="form-label">Follow-up Date</label><input type="date" id="t-followup"></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-default" onclick="closeModal()">Cancel</button>
      <button class="btn btn-success" onclick="saveTouch(${prospectId})">Save Touch</button>
    </div>
  </div></div>`;
  window._touchType='call';
}

function selectTouchType(type){
  window._touchType=type;
  ['call','email','meeting','note'].forEach(t=>{
    document.getElementById('tt-'+t).className=t===type?'btn btn-info':'btn btn-default';
  });
}

async function saveTouch(prospectId){
  const notes=document.getElementById('t-notes').value;
  if(!notes){alert('Notes required');return}
  const products=Array.from(document.querySelectorAll('.prod-check:checked')).map(c=>c.value);
  const data={
    prospect_id:prospectId,
    touch_type:window._touchType||'call',
    notes,
    products_discussed:products.length?products:null,
    follow_up_date:document.getElementById('t-followup').value||null
  };
  try{
    await fetch('/api/crm/touches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    closeModal();loadCRMProspects();
  }catch(e){alert('Error saving touch')}
}

async function convertProspect(id){
  if(!confirm('Convert this prospect to a customer? They will be marked as converted.'))return;
  try{
    const res=await fetch('/api/crm/prospects/'+id+'/convert',{method:'POST'});
    const p=await res.json();
    // Optionally add to customers list
    if(!S.customers)S.customers=[];
    if(!S.customers.find(c=>c.name===p.company_name)){
      S.customers.push({name:p.company_name,destination:p.address||'',trader:S.trader});
      saveAllLocal();
    }
    closeModal();loadCRMProspects();
    alert('Prospect converted! They have been added to your Customers list.');
  }catch(e){alert('Error converting prospect')}
}

// ==================== END CRM FUNCTIONS ====================

function showCustModal(c=null){
  const locs=c?.locations||[c?.destination].filter(Boolean);
  document.getElementById('modal').innerHTML=`<div class="modal-overlay" onclick="closeModal()"><div class="modal" onclick="event.stopPropagation()">
    <div class="modal-header"><span class="modal-title">${c?'EDIT':'NEW'} CUSTOMER</span><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      ${S.trader==='Admin'?`<div style="margin-bottom:16px;padding:12px;background:rgba(245,166,35,0.1);border:1px solid #f5a623;border-radius:4px">
        <div class="form-group" style="margin:0"><label class="form-label" style="color:#f5a623;font-weight:600">🔑 Assign to Trader</label>
        <select id="m-trader" style="width:200px">${TRADERS.map(t=>`<option value="${t}" ${(c?.trader||'Ian P')===t?'selected':''}>${t}</option>`).join('')}</select></div>
      </div>`:''}
      <div class="form-grid">
        <div class="form-group full"><label class="form-label">Company Name</label><input type="text" id="m-name" value="${c?.name||''}"></div>
        <div class="form-group"><label class="form-label">Contact</label><input type="text" id="m-contact" value="${c?.contact||''}"></div>
        <div class="form-group"><label class="form-label">Phone</label><input type="text" id="m-phone" value="${c?.phone||''}"></div>
        <div class="form-group"><label class="form-label">Email</label><input type="text" id="m-email" value="${c?.email||''}"></div>
        <div class="form-group full"><label class="form-label">Terms</label><input type="text" id="m-terms" value="${c?.terms||''}"></div>
        <div class="form-group full">
          <label class="form-label">Delivery Locations (City, ST)</label>
          <div id="cust-locations">
            ${locs.length?locs.map((loc,i)=>`<div style="display:flex;gap:4px;margin-bottom:4px"><input type="text" class="cust-loc" value="${loc}" placeholder="e.g. Cincinnati, OH" style="flex:1"><button class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">×</button></div>`).join(''):'<div style="display:flex;gap:4px;margin-bottom:4px"><input type="text" class="cust-loc" placeholder="e.g. Cincinnati, OH" style="flex:1"><button class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">×</button></div>'}
          </div>
          <button class="btn btn-default btn-sm" onclick="addCustLocation()" style="margin-top:4px">+ Add Location</button>
        </div>
      </div>
    </div>
    <div class="modal-footer"><button class="btn btn-default" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveCust('${c?.name||''}')">Save</button></div>
  </div></div>`;
}

function addCustLocation(){
  const container=document.getElementById('cust-locations');
  const div=document.createElement('div');
  div.style='display:flex;gap:4px;margin-bottom:4px';
  div.innerHTML=`<input type="text" class="cust-loc" placeholder="e.g. Cincinnati, OH" style="flex:1"><button class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">×</button>`;
  container.appendChild(div);
}

// Kanban drag-and-drop handler
async function handleKanbanDrop(event,newStatus){
  event.preventDefault();
  const prospectId=event.dataTransfer.getData('text/plain');
  if(!prospectId)return;
  try{
    const res=await fetch('/api/crm/prospects/'+prospectId,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:newStatus})});
    if(res.ok){showToast('Moved to '+newStatus,'positive');loadCRMProspects()}
    else showToast('Failed to update status','negative');
  }catch(e){showToast('Error: '+e.message,'negative')}
}

// Quick touch modal (CRM FAB)
function showQuickTouchModal(){
  const prospects=S.crmProspects||[];
  if(!prospects.length){showToast('No prospects loaded','warn');return}
  document.getElementById('modal').innerHTML=
    `<div class="modal-overlay" onclick="closeModal()"><div class="modal" onclick="event.stopPropagation()">
    <div class="modal-header"><span class="modal-title">Quick Log Touch</span><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body"><div class="form-grid">
    <div class="form-group full"><label class="form-label">Prospect</label><select id="qt-prospect"><option value="">Select...</option>${prospects.map(p=>'<option value="'+p.id+'">'+p.company_name+'</option>').join('')}</select></div>
    <div class="form-group"><label class="form-label">Type</label><select id="qt-type"><option value="call">Call</option><option value="email">Email</option><option value="meeting">Meeting</option><option value="note">Note</option></select></div>
    <div class="form-group"><label class="form-label">Follow-up Date</label><input type="date" id="qt-follow"></div>
    <div class="form-group full"><label class="form-label">Notes</label><textarea id="qt-notes" rows="3" placeholder="Quick notes..."></textarea></div>
    </div></div>
    <div class="modal-footer"><button class="btn btn-default" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveQuickTouch()">Save Touch</button></div>
    </div></div>`;
}

async function saveQuickTouch(){
  const pid=document.getElementById('qt-prospect').value;
  const type=document.getElementById('qt-type').value;
  const notes=document.getElementById('qt-notes').value;
  const followUp=document.getElementById('qt-follow').value;
  if(!pid){showToast('Select a prospect','warn');return}
  try{
    const res=await fetch('/api/crm/touches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prospect_id:parseInt(pid),touch_type:type,notes,follow_up_date:followUp||null,products_discussed:''})});
    if(res.ok){closeModal();showToast('Touch logged!','positive');loadCRMProspects()}
    else showToast('Failed to save','negative');
  }catch(e){showToast('Error: '+e.message,'negative')}
}

