const ICONS = {
  today: ['M4.5 5.5h15a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1z', 'M3.5 10h17', 'M8 3.5v4', 'M16 3.5v4'],
  board: ['M4 4.5h4.5v15H4z', 'M9.75 4.5h4.5v15h-4.5z', 'M15.5 4.5H20v9h-4.5z'],
  agenda: ['M12 7v5.2l3.2 1.8', 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z'],
  people: ['M12 12.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z', 'M5.2 19.4c1.3-3 3.6-4.6 6.8-4.6s5.5 1.6 6.8 4.6'],
  search: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'M16.2 16.2 21 21'],
  gear: ['M4 7h16', 'M4 12h16', 'M4 17h16', 'M8 5.2a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6z', 'M15 10.2a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6z', 'M9 15.2a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6z'],
  trash: ['M5 7.5h14', 'M9.2 7.4V5.2h5.6v2.2', 'M7.2 7.5l.8 12.2h8l.8-12.2'],
  close: ['M6 6l12 12', 'M18 6 6 18'],
  up: ['M6 14.5 12 8l6 6.5'],
  down: ['M6 9.5 12 16l6-6.5'],
  plus: ['M12 5v14', 'M5 12h14'],
};

function flatten(list) {
  const out = [];
  for (const item of list) {
    if (Array.isArray(item)) out.push(...flatten(item));
    else out.push(item);
  }
  return out;
}

export function el(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  if (tag === 'button' && !props.type) node.type = 'button';
  const later = [];
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'value' || key === 'checked' || key === 'selected') {
      later.push([key, value]);
      continue;
    }
    if (key === 'class') node.className = value;
    else if (key === 'dataset') {
      for (const [name, data] of Object.entries(value)) node.dataset[name] = String(data);
    } else if (key === 'style' && typeof value === 'object') {
      for (const [name, data] of Object.entries(value)) node.style.setProperty(name, data);
    } else if (key === 'htmlFor') node.htmlFor = value;
    else if (['disabled', 'draggable', 'hidden', 'open'].includes(key)) node[key] = value;
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const kid of flatten(kids)) {
    if (kid == null || kid === false) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  for (const [key, value] of later) node[key] = value;
  return node;
}

export function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('icon');
  for (const d of ICONS[name] || []) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.8');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.append(path);
  }
  return svg;
}

export function toast(message) {
  const node = document.getElementById('toast');
  if (!node) return;
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    node.hidden = true;
  }, 2800);
}

let renderFrame = 0;
export function nextFrame(fn) {
  cancelAnimationFrame(renderFrame);
  renderFrame = requestAnimationFrame(fn);
}
