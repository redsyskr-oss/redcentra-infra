export type EquipmentFaceSide = 'front' | 'rear';

type FaceplateVendor = 'IBM' | 'HPE' | 'DELL' | 'CISCO' | 'JUNIPER' | 'SECUI' | 'WINS' | 'AHNLAB' | 'PIOLINK' | 'GENERIC';
type FaceplateKind = 'server' | 'unix' | 'switch' | 'backbone' | 'firewall' | 'ips' | 'ddos' | 'l4' | 'waf' | 'security';

export interface EquipmentFaceplateInput {
  vendor?: string;
  modelName?: string;
  deviceName?: string;
  deviceType?: string;
  equipmentType?: string;
  portCount?: 16 | 24 | 48;
  portLayout?: 'SINGLE_ROW' | 'DOUBLE_ROW' | 'MODULAR';
  side: EquipmentFaceSide;
  animated?: boolean;
}

const VENDOR_STYLE: Record<FaceplateVendor, { accent: string; label: string }> = {
  IBM: { accent: '#5aa7ff', label: 'IBM' }, HPE: { accent: '#00c781', label: 'HPE' },
  DELL: { accent: '#4fa7e8', label: 'DELL' }, CISCO: { accent: '#35b9d5', label: 'CISCO' },
  JUNIPER: { accent: '#8bc34a', label: 'JUNIPER' }, SECUI: { accent: '#ef5350', label: 'SECUI' },
  WINS: { accent: '#ff8a45', label: 'WINS' }, AHNLAB: { accent: '#26c6a6', label: 'AHNLAB' },
  PIOLINK: { accent: '#8b7cf6', label: 'PIOLINK' }, GENERIC: { accent: '#94a3b8', label: 'EQUIPMENT' },
};

function resolveVendor(value: string): FaceplateVendor {
  if (/IBM|POWER\s?[0-9]|UNIX/i.test(value)) return 'IBM';
  if (/HPE|HEWLETT|PROLIANT|\bHP\b/i.test(value)) return 'HPE';
  if (/DELL|POWEREDGE/i.test(value)) return 'DELL';
  if (/CISCO|CATALYST|NEXUS/i.test(value)) return 'CISCO';
  if (/JUNIPER|\bQFX\b|\bEX\d/i.test(value)) return 'JUNIPER';
  if (/SECUI|시큐아이/i.test(value)) return 'SECUI';
  if (/\bWINS\b|윈스/i.test(value)) return 'WINS';
  if (/AHNLAB|안랩|TRUSGUARD/i.test(value)) return 'AHNLAB';
  if (/PIOLINK|파이오링크|WEBFRONT/i.test(value)) return 'PIOLINK';
  return 'GENERIC';
}

function resolveKind(value: string, vendor: FaceplateVendor, layout?: EquipmentFaceplateInput['portLayout']): FaceplateKind {
  if (layout === 'MODULAR' || /BACKBONE|CORE.?SWITCH|백본|코어.?스위치/i.test(value)) return 'backbone';
  if (/WEB.?FIREWALL|웹.?방화벽|\bWAF\b/i.test(value)) return 'waf';
  if (/\bL4\b|LOAD.?BALANC/i.test(value)) return 'l4';
  if (/DDOS|디도스/i.test(value)) return 'ddos';
  if (/\bIPS\b|침입.?방지/i.test(value)) return 'ips';
  if (/FIREWALL|방화벽|UTM/i.test(value)) return 'firewall';
  if (/SWITCH|스위치|CATALYST|NEXUS|JUNIPER|\bQFX\b/i.test(value)) return 'switch';
  if (vendor === 'IBM' || /UNIX/i.test(value)) return 'unix';
  if (/SERVER|서버|PROLIANT|POWEREDGE/i.test(value)) return 'server';
  if (vendor === 'SECUI' || vendor === 'WINS' || vendor === 'AHNLAB') return 'security';
  if (vendor === 'PIOLINK') return 'l4';
  return 'server';
}

function ports(count: number, y: number, startX: number, portWidth: number, gap: number): string {
  return Array.from({ length: count }, (_, index) => {
    const x = startX + index * (portWidth + gap);
    return `<g><rect x="${x}" y="${y}" width="${portWidth}" height="22" rx="2" fill="#05080d" stroke="#64748b" stroke-width="2"/><rect x="${x + 4}" y="${y + 15}" width="${Math.max(3, portWidth - 8)}" height="3" fill="#94a3b8"/></g>`;
  }).join('');
}

function vents(x: number, y: number, width: number, height: number): string {
  const dots: string[] = [];
  for (let cy = y + 7; cy < y + height - 4; cy += 11) {
    for (let cx = x + 7; cx < x + width - 4; cx += 11) dots.push(`<circle cx="${cx}" cy="${cy}" r="2.5" fill="#475569"/>`);
  }
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="5" fill="#111827" stroke="#334155"/>${dots.join('')}`;
}

function switchPorts(portCount: 16 | 24 | 48, layout: EquipmentFaceplateInput['portLayout']): string {
  const doubleRow = layout !== 'SINGLE_ROW';
  const perRow = doubleRow ? Math.ceil(portCount / 2) : portCount;
  const width = perRow > 12 ? 12 : perRow > 8 ? 20 : 28;
  const gap = perRow > 12 ? 3 : 6;
  const first = ports(perRow, doubleRow ? 33 : 51, 106, width, gap);
  const second = doubleRow ? ports(portCount - perRow, 66, 106, width, gap) : '';
  return `${first}${second}<text x="106" y="112" fill="#94a3b8" font-family="Arial,sans-serif" font-size="8">${portCount} PORT · ${doubleRow ? 'DOUBLE ROW' : 'SINGLE ROW'}</text>`;
}

export function createEquipmentFaceplateSvg(input: EquipmentFaceplateInput): string {
  const searchable = `${input.vendor ?? ''} ${input.modelName ?? ''} ${input.deviceName ?? ''} ${input.deviceType ?? ''} ${input.equipmentType ?? ''}`;
  const vendor = resolveVendor(searchable);
  const kind = resolveKind(searchable, vendor, input.portLayout);
  const { accent, label } = VENDOR_STYLE[vendor];
  const sideLabel = input.side === 'front' ? 'FRONT' : 'REAR';
  const portCount = input.portCount ?? 24;
  let center = '';

  if (input.side === 'rear') {
    center = `${vents(92, 31, 160, 58)}${ports(kind === 'backbone' ? 16 : kind === 'switch' ? 12 : 6, 50, 275, 18, 5)}<rect x="545" y="30" width="76" height="62" rx="5" fill="#05080d" stroke="#64748b" stroke-width="2"/><rect x="557" y="42" width="52" height="17" rx="2" fill="#1e293b"/><circle cx="583" cy="76" r="9" fill="#111827" stroke="${accent}" stroke-width="3"/><rect x="635" y="30" width="76" height="62" rx="5" fill="#05080d" stroke="#64748b" stroke-width="2"/><rect x="647" y="42" width="52" height="17" rx="2" fill="#1e293b"/><circle cx="673" cy="76" r="9" fill="#111827" stroke="${accent}" stroke-width="3"/>`;
  } else if (kind === 'backbone') {
    center = `${Array.from({ length: 6 }, (_, index) => { const x = 98 + index * 82; return `<g><rect x="${x}" y="25" width="74" height="70" rx="4" fill="#080d15" stroke="#64748b"/><rect x="${x + 7}" y="32" width="60" height="4" fill="${accent}" opacity=".7"/>${ports(4, 48, x + 8, 12, 3)}<text x="${x + 37}" y="88" fill="#94a3b8" font-family="Arial" font-size="6" text-anchor="middle">LINE ${index + 1}</text></g>`; }).join('')}<rect x="600" y="28" width="106" height="64" rx="5" fill="#080d15" stroke="${accent}" stroke-width="2"/><text x="653" y="48" fill="${accent}" font-family="Arial" font-size="8" text-anchor="middle">SUPERVISOR</text><circle cx="630" cy="66" r="5" fill="#22c55e"/><circle cx="653" cy="66" r="5" fill="${accent}"/><circle cx="676" cy="66" r="5" fill="#22c55e"/>`;
  } else if (kind === 'switch' || kind === 'l4' || kind === 'waf') {
    center = `${switchPorts(portCount, input.portLayout ?? 'DOUBLE_ROW')}<rect x="545" y="35" width="92" height="55" rx="5" fill="#080d15" stroke="${accent}" stroke-width="2"/><rect x="558" y="48" width="22" height="22" fill="#020617" stroke="#64748b"/><rect x="590" y="48" width="34" height="22" fill="#020617" stroke="#64748b"/>`;
  } else if (kind === 'server' || kind === 'unix') {
    center = `${vents(90, 29, 155, 66)}${Array.from({ length: 8 }, (_, index) => `<rect x="${265 + index * 45}" y="31" width="38" height="62" rx="3" fill="#090e17" stroke="#475569" stroke-width="2"/><rect x="${272 + index * 45}" y="77" width="24" height="5" fill="${accent}" opacity=".75"/>`).join('')}<rect x="640" y="30" width="70" height="64" rx="5" fill="#080d15" stroke="#475569"/><circle cx="674" cy="49" r="6" fill="${accent}"/><rect x="654" y="66" width="40" height="13" rx="2" fill="#020617" stroke="#64748b"/>`;
  } else {
    center = `${vents(92, 30, 205, 64)}${ports(8, 50, 320, 27, 7)}<rect x="610" y="34" width="96" height="56" rx="5" fill="#080d15" stroke="${accent}" stroke-width="2"/><circle cx="630" cy="52" r="5" fill="${accent}"/><rect x="644" y="45" width="48" height="14" rx="2" fill="#020617"/>`;
  }

  const labelFont = label.length > 7 ? 9 : label.length > 5 ? 11 : 13;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="124" viewBox="0 0 800 124"><defs><linearGradient id="body" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#273244"/><stop offset=".45" stop-color="#111827"/><stop offset="1" stop-color="#070b12"/></linearGradient></defs><rect width="800" height="124" rx="9" fill="url(#body)"/><rect x="4" y="4" width="792" height="116" rx="7" fill="none" stroke="#475569" stroke-width="3"/><rect x="12" y="15" width="58" height="94" rx="6" fill="#060a10" stroke="#334155"/><rect x="24" y="26" width="34" height="5" rx="2" fill="${accent}"/><circle cx="30" cy="49" r="5" fill="${accent}"/><circle cx="48" cy="49" r="5" fill="#22c55e"/><rect x="23" y="66" width="36" height="20" rx="3" fill="#111827" stroke="#64748b"/>${center}<rect x="720" y="15" width="68" height="94" rx="6" fill="#060a10" stroke="#334155"/><text x="754" y="49" fill="${accent}" font-family="Arial,sans-serif" font-size="${labelFont}" font-weight="700" text-anchor="middle">${label}</text><text x="754" y="71" fill="#94a3b8" font-family="Arial,sans-serif" font-size="10" text-anchor="middle">${sideLabel}</text></svg>`;
}

export function equipmentFaceplateDataUrl(input: EquipmentFaceplateInput): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(createEquipmentFaceplateSvg(input))}`;
}
