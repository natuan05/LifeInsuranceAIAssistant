'use strict';
const $ = id => document.getElementById(id);
let csrf = '', current = null, page = 1, auditPage = 1, secret = '', busy = false;
const fields = value => Object.fromEntries(new FormData(value));
function message(text = '', error = false) { $(error ? 'error' : 'notice').textContent = text; $('error').hidden = !error; $('create-error').textContent = error ? text : ''; $('create-error').hidden = !error; }
function clearSecret() { secret = ''; $('credential-fields').replaceChildren(); }
function signedOut() { csrf = ''; current = null; clearSecret(); for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close(); $('workspace').hidden = true; $('login').hidden = false; $('account-list').replaceChildren(); $('detail').hidden = true; $('audit-list').replaceChildren(); }
async function api(path, body) {
  const response = await fetch('/ops/v1/' + path, { method: body === undefined ? 'GET' : 'POST', cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(15000),
    headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'X-Auth-Request': '1', 'X-CSRF-Token': csrf }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (!response.ok) {
    if (response.status === 401) signedOut();
    const failure = new Error(response.status === 409 ? 'Dữ liệu đã thay đổi hoặc thao tác đã thực hiện. Tải lại chi tiết trước khi thao tác tiếp; credential cũ không được phát lại.'
      : response.status === 400 ? 'Thông tin chưa hợp lệ. Kiểm tra email, mật khẩu, vai trò và trạng thái Staff/Customer.'
      : response.status === 401 ? 'Phiên hết hạn hoặc thông tin operator chưa đúng.' : response.status === 403 ? 'Yêu cầu không hợp lệ. Tải lại và đăng nhập lại.'
      : response.status === 429 ? 'Quá nhiều yêu cầu; vui lòng chờ rồi thử lại.' : 'Không thực hiện được. Kiểm tra kết nối; không gửi lại vô hạn.'); failure.status = response.status; throw failure;
  }
  return response.json();
}
async function perform(work) {
  if (busy) return;
  busy = true; message(); const buttons = [...document.querySelectorAll('form button, #logout, #create-open, #status-action, #reset-action')].map(b => [b, b.disabled]); buttons.forEach(([b]) => b.disabled = true);
  try { await work(); } catch (error) { message(error.message || 'Không thực hiện được yêu cầu.', true); }
  finally { busy = false; buttons.forEach(([b, disabled]) => { if (b.isConnected) b.disabled = disabled; }); }
}
function cell(text, tag = 'td') { const node = document.createElement(tag); node.textContent = text ?? '—'; return node; }
function table(target, headings, rows) { const wrap = document.createElement('div'); wrap.className = 'table-wrap'; const table = document.createElement('table'); const header = document.createElement('tr'); headings.forEach(h => header.append(cell(h, 'th'))); const head = document.createElement('thead'); head.append(header); table.append(head); const body = document.createElement('tbody'); rows.forEach(row => body.append(row)); table.append(body); wrap.append(table); $(target).replaceChildren(wrap); }
function definitions(target, pairs) { $(target).replaceChildren(); for (const [key, value] of pairs) { const item = document.createElement('div'); item.append(cell(key, 'dt'), cell(value, 'dd')); $(target).append(item); } }
const name = a => a.staffProfile?.fullName || a.customerProfile?.fullName || a.accountCode;
function query(form, p) { const values = new URLSearchParams({ page: String(p), pageSize: '20' }); for (const [key, value] of Object.entries(fields(form))) if (value) values.set(key, value); return values; }
async function loadAccounts() {
  $('account-list').textContent = 'Đang tải…';
  try {
    const result = await api('accounts?' + query($('filters'), page));
    if (!result.items.length) $('account-list').textContent = 'Không tìm thấy tài khoản.';
    else table('account-list', ['Tài khoản', 'Vai trò', 'Trạng thái / Phân công', 'Thao tác'], result.items.map(account => {
      const row = document.createElement('tr'), title = cell(name(account)); title.append(cell(account.accountCode + ' · ' + account.email, 'small'));
      const assignment = account.customerProfile?.assignments[0];
      const state = cell(account.status === 'ACTIVE' ? 'Hoạt động' : 'Đã khóa');
      if (account.role === 'CUSTOMER') state.append(cell(assignment ? assignment.staff.fullName + (assignment.staff.user.status === 'LOCKED' ? ' · Staff đã khóa' : '') : 'Chưa phân công', 'small'));
      const action = document.createElement('td'), button = document.createElement('button'); button.type = 'button'; button.textContent = 'Chi tiết'; button.setAttribute('aria-label', 'Chi tiết ' + account.accountCode); button.addEventListener('click', () => perform(() => loadDetail(account.id))); action.append(button);
      row.append(title, cell(account.role), state, action); return row;
    }));
    $('account-page').textContent = `Trang ${page} · ${result.total} tài khoản`;
    $('account-prev').disabled = page <= 1; $('account-next').disabled = page * 20 >= result.total;
  } catch (error) { $('account-list').replaceChildren(); throw error; }
}
async function loadStaff() {
  const params = new URLSearchParams({ role: 'STAFF', status: 'ACTIVE', pageSize: '50', q: $('staff-search').value });
  const result = await api('accounts?' + params); const select = $('staff-select'); select.replaceChildren(new Option('Chưa phân công', ''));
  result.items.forEach(a => select.add(new Option(`${name(a)} · ${a.accountCode} · ${a.email}`, a.id)));
  const id = current?.customerProfile?.assignments[0]?.staffId; if (id && result.items.some(a => a.id === id)) select.value = id;
  if (result.total > 50) message('Có hơn 50 Staff. Nhập email, tên hoặc mã để thu hẹp kết quả.');
}
async function loadDetail(id) {
  current = null; $('detail').hidden = true; const account = await api('accounts/' + id); current = account;
  definitions('detail-fields', [['Họ và tên', name(account)], ['Mã / Vai trò', account.accountCode + ' / ' + account.role], ['Email', account.email], ['Trạng thái', account.status],
    ['Lời nhắc đổi mật khẩu', account.passwordChangeRecommended ? 'Đang bật' : 'Đã tắt'], ['Staff phụ trách', account.customerProfile?.assignments[0]?.staff.fullName || '—'], ['Phiên bản phân công', account.customerProfile?.assignmentVersion ?? '—']]);
  $('status-action').textContent = account.status === 'ACTIVE' ? 'Khóa tài khoản' : 'Mở khóa tài khoản';
  $('assignment-form').hidden = account.role !== 'CUSTOMER';
  if (account.role === 'CUSTOMER') { $('staff-search').value = ''; await loadStaff(); }
  $('detail').hidden = false;
}
function showCredential(result, account) { clearSecret(); $('copy-password').textContent = 'Copy mật khẩu'; secret = result.initialPassword; definitions('credential-fields', [['Email', account.email || 'Xem chi tiết tài khoản'], ['Mã tài khoản', account.accountCode || 'Xem chi tiết tài khoản'], ['Mật khẩu mới', secret]]); $('credential-dialog').showModal(); }
function confirmAction(text) { $('confirm-message').textContent = text; $('confirm-dialog').showModal(); return new Promise(resolve => { const end = value => { $('confirm-dialog').close(); $('confirm-yes').onclick = null; $('confirm-no').onclick = null; $('confirm-dialog').oncancel = null; resolve(value); }; $('confirm-yes').onclick = () => end(true); $('confirm-no').onclick = () => end(false); $('confirm-dialog').oncancel = event => { event.preventDefault(); end(false); }; }); }
async function loadAudit() {
  $('audit-list').textContent = 'Đang tải…';
  try { const result = await api('audit?' + query($('audit-filter'), auditPage));
    if (!result.items.length) $('audit-list').textContent = 'Chưa có thao tác phù hợp.';
    else table('audit-list', ['Thời gian', 'Người thực hiện', 'Hành động', 'Đối tượng', 'Kết quả'], result.items.map(entry => { const row = document.createElement('tr'); row.append(...[new Date(entry.createdAt).toLocaleString('vi-VN'), entry.operatorId || entry.actorId || entry.actorType, entry.action, entry.targetId, entry.outcome].map(v => cell(v))); return row; }));
    $('audit-page').textContent = `Trang ${auditPage} · ${result.total} sự kiện`; $('audit-prev').disabled = auditPage <= 1; $('audit-next').disabled = auditPage * 20 >= result.total;
  } catch(error) { $('audit-list').replaceChildren(); throw error; }
}
function showWorkspace() { $('login').hidden = true; $('workspace').hidden = false; }
$('login-form').addEventListener('submit', event => { event.preventDefault(); perform(async () => { const session = await api('auth/login', fields(event.target)); csrf = session.csrfToken; event.target.reset(); showWorkspace(); await loadAccounts(); }); });
$('logout').onclick = () => perform(async () => { await api('auth/logout', {}); signedOut(); });
$('filters').onsubmit = event => { event.preventDefault(); page = 1; perform(loadAccounts); };
$('account-prev').onclick = () => { if (busy) return; page--; perform(loadAccounts); }; $('account-next').onclick = () => { if (busy) return; page++; perform(loadAccounts); };
$('detail-close').onclick = () => { current = null; $('detail').hidden = true; };
$('staff-find').onclick = () => perform(loadStaff);
$('show-accounts').onclick = () => perform(async () => { $('accounts-section').hidden = false; $('audit-section').hidden = true; await loadAccounts(); });
$('show-audit').onclick = () => perform(async () => { $('accounts-section').hidden = true; $('audit-section').hidden = false; await loadAudit(); });
$('audit-filter').onsubmit = event => { event.preventDefault(); auditPage = 1; perform(loadAudit); }; $('audit-prev').onclick = () => { if (busy) return; auditPage--; perform(loadAudit); }; $('audit-next').onclick = () => { if (busy) return; auditPage++; perform(loadAudit); };
$('create-open').onclick = () => { $('create-form').reset(); $('create-dialog').showModal(); }; $('create-cancel').onclick = () => $('create-dialog').close();
$('create-dialog').addEventListener('close', () => $('create-form').reset());
$('create-form').onsubmit = event => { event.preventDefault(); perform(async () => {
  const input = fields(event.target); if (!input.password) delete input.password;
  if (input.password && (Array.from(input.password).length < 6 || new TextEncoder().encode(input.password).length > 72)) throw new Error('Mật khẩu cần tối thiểu 6 ký tự, tối đa 72 byte UTF-8.');
  const result = await api('accounts', { ...input, requestId: crypto.randomUUID() }); $('create-dialog').close(); showCredential(result, result); await loadAccounts();
}); };
$('status-action').onclick = async () => { if (!current || busy) return; const account = current; const status = account.status === 'ACTIVE' ? 'LOCKED' : 'ACTIVE'; if (!await confirmAction(`${status === 'LOCKED' ? 'Khóa' : 'Mở khóa'} ${account.accountCode} — ${account.email}? Tất cả phiên cũ bị thu hồi.`)) return;
  perform(async () => { try { await api('accounts/' + account.id + '/status', { status, expectedUpdatedAt: account.updatedAt, requestId: crypto.randomUUID() }); } catch(error) { await loadDetail(account.id); throw error; } await loadDetail(account.id); await loadAccounts(); message('Đã cập nhật trạng thái và thu hồi phiên cũ.'); }); };
$('reset-action').onclick = async () => { if (!current || busy) return; const account = current; if (!await confirmAction(`Reset mật khẩu ${account.accountCode} — ${account.email}? Mật khẩu cũ và tất cả phiên cũ sẽ hết hiệu lực.`)) return;
  perform(async () => { let result; try { result = await api('accounts/' + account.id + '/reset-password', { expectedUpdatedAt: account.updatedAt, requestId: crypto.randomUUID() }); } catch(error) { await loadDetail(account.id); throw error; } showCredential(result, account); await loadDetail(account.id); await loadAccounts(); }); };
$('assignment-form').onsubmit = async event => { event.preventDefault(); if (!current || busy) return; const account = current, staffId = $('staff-select').value || null, selected = $('staff-select').selectedOptions[0].textContent;
  if (!await confirmAction(`Cập nhật ${account.accountCode} — ${account.email} sang ${selected}? Staff cũ mất quyền ở request tiếp theo.`)) return;
  perform(async () => { try { await api('accounts/' + account.id + '/assignment', { staffId, expectedVersion: account.customerProfile.assignmentVersion, requestId: crypto.randomUUID() }); } catch(error) { await loadDetail(account.id); throw error; } await loadDetail(account.id); await loadAccounts(); message('Đã cập nhật phân công.'); }); };
$('credential-close').onclick = () => $('credential-dialog').close(); $('credential-dialog').addEventListener('close', clearSecret);
$('copy-password').onclick = async () => { try { await navigator.clipboard.writeText(secret); $('copy-password').textContent = 'Đã copy'; } catch { message('Không copy được; hãy chọn mật khẩu và sao chép thủ công.', true); } };
for (const input of document.querySelectorAll('input[type=password]')) { input.setAttribute('aria-label', input.closest('label').firstChild.textContent.trim()); input.id = 'ops-password-' + input.name; const wrap = document.createElement('div'); wrap.className = 'password-wrap'; input.replaceWith(wrap); wrap.append(input); const toggle = document.createElement('button'); toggle.type = 'button'; toggle.textContent = 'Hiện'; toggle.setAttribute('aria-label', 'Hiện mật khẩu'); toggle.setAttribute('aria-controls', input.id); toggle.setAttribute('aria-pressed', 'false'); toggle.onclick = () => { const visible = input.type === 'password'; input.type = visible ? 'text' : 'password'; toggle.textContent = visible ? 'Ẩn' : 'Hiện'; toggle.setAttribute('aria-pressed', String(visible)); toggle.setAttribute('aria-label', visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'); }; wrap.append(toggle); input.form.addEventListener('reset', () => { input.type = 'password'; toggle.textContent = 'Hiện'; toggle.setAttribute('aria-pressed', 'false'); toggle.setAttribute('aria-label', 'Hiện mật khẩu'); }); }
window.addEventListener('pagehide', clearSecret);
perform(async () => { let session; try { session = await api('auth/me'); } catch(error) { if (error.status === 401) return; throw error; } csrf = session.csrfToken; showWorkspace(); await loadAccounts(); });
