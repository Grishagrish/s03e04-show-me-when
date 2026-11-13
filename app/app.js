import { fetchIncidents, ack } from './api.js';
const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const status = document.querySelector('#status');
const rows = new Map();
const acknowledged = new Set();
let refreshing = false;
const formatter = new Intl.DateTimeFormat(navigator.language, {
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});
function element(tag, className, text) {
  const el = document.createElement(tag);
  el.className = className;
  el.textContent = text;
  return el;
}
function createRow(incident) {
  const row = element('li', 'row', '');
  row.dataset.testid = 'incident-row';
  row.dataset.id = incident.id;
  const id = element('span', 'id', incident.id);
  const severity = element('span', 'sev', '');
  const summary = element('span', 'what', '');
  const time = element('time', '', '');
  const button = element('button', '', 'Ack');
  button.type = 'button';
  button.dataset.testid = 'ack';
  button.setAttribute('aria-label', `Ack ${incident.id}`);
  if (acknowledged.has(incident.id)) {
    button.textContent = 'Acked'; button.dataset.testid = 'acked'; button.disabled = true;
  }
  button.addEventListener('click', async () => {
    button.disabled = true; button.textContent = 'Acknowledging…';
    try {
      await ack(incident.id);
      acknowledged.add(incident.id);
      button.textContent = 'Acked'; button.dataset.testid = 'acked';
      status.textContent = `${incident.id} acknowledged.`;
    } catch {
      button.disabled = false; button.textContent = 'Ack';
      status.textContent = `Could not acknowledge ${incident.id}. Please retry.`;
    }
  });
  row.append(id, severity, summary, time, button);
  return { row, severity, summary, time };
}
function render(incidents) {
  const current = new Set(incidents.map(i => i.id));
  for (const [id, item] of rows) {
    if (!current.has(id)) { item.row.remove(); rows.delete(id); }
  }
  [...incidents].sort((a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt)).forEach((incident, index) => {
    let item = rows.get(incident.id);
    if (!item) { item = createRow(incident); rows.set(incident.id, item); }
    item.row.className = `row ${incident.severity}`;
    item.severity.textContent = incident.severity;
    item.summary.textContent = `${incident.service} · ${incident.region} · ${incident.summary}`;
    item.time.dateTime = incident.openedAt;
    item.time.textContent = formatter.format(new Date(incident.openedAt));
    if (list.children[index] !== item.row) list.insertBefore(item.row, list.children[index] || null);
  });
  empty.hidden = incidents.length > 0;
}
async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    const page = await fetchIncidents();
    render(page.incidents);
    loader.hidden = true; list.hidden = false;
    if (status.dataset.error) { status.textContent = 'Connection restored.'; delete status.dataset.error; }
  } catch {
    status.textContent = 'Unable to refresh. Retrying automatically; displayed data may be outdated.';
    status.dataset.error = 'true';
  } finally { refreshing = false; }
}
refresh();
setInterval(refresh, 2000);
