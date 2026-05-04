const fs = require('fs');
const file = '/Users/dushyantsaini/Documents/mistyvisuals-os/frontend/app/leads/[id]/quotes/[versionId]/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// The first chunk to replace (div key={t.id})
let target1 = `<div key={t.id} className="flex gap-4 items-center p-4 bg-neutral-50 border border-neutral-100 rounded-xl group transition-colors hover:border-neutral-200">
                                              <div className="w-10 h-10 bg-white rounded-lg shadow-sm border border-neutral-200 flex items-center justify-center shrink-0">{defaultEmoji}</div>`;

let replacement1 = `<div key={t.id} className="flex flex-col md:flex-row gap-4 md:items-center p-4 bg-neutral-50 border border-neutral-100 rounded-xl group transition-colors hover:border-neutral-200">
                                              <div className="flex items-center gap-3 w-full md:w-auto">
                                                 <div className="w-10 h-10 bg-white rounded-lg shadow-sm border border-neutral-200 flex items-center justify-center shrink-0">{defaultEmoji}</div>`;

content = content.replaceAll(target1, replacement1);

// The second chunk to replace (qty and remove button)
let target2 = `<div className="flex items-center gap-2">
                                                 <span className="text-xs text-neutral-400 font-bold shrink-0">QTY</span>
                                                 <input type="text" inputMode="numeric" pattern="[0-9]*" value={t.quantity === 0 ? '' : t.quantity} onChange={(ev) => { const raw = ev.target.value.replace(/[^0-9]/g, ''); updateItem(t.id, { quantity: raw === '' ? 0 : Number(raw) }) }} onBlur={() => { if (!t.quantity || t.quantity < 1) updateItem(t.id, { quantity: 1 }) }} className="w-16 text-center bg-white border border-neutral-200 text-sm px-2 py-1.5 rounded focus:outline-none" />
                                              </div>
                                              <button onClick={() => removeItem(t.id)} className="text-neutral-300 hover:text-red-500 px-2 transition opacity-0 group-hover:opacity-100">✕</button>
                                           </div>`;

let replacement2 = `</div>
                                              <div className="flex items-center justify-between md:justify-end gap-2 w-full md:w-auto md:ml-auto">
                                                 <div className="flex items-center gap-2">
                                                    <span className="text-xs text-neutral-400 font-bold shrink-0">QTY</span>
                                                    <input type="text" inputMode="numeric" pattern="[0-9]*" value={t.quantity === 0 ? '' : t.quantity} onChange={(ev) => { const raw = ev.target.value.replace(/[^0-9]/g, ''); updateItem(t.id, { quantity: raw === '' ? 0 : Number(raw) }) }} onBlur={() => { if (!t.quantity || t.quantity < 1) updateItem(t.id, { quantity: 1 }) }} className="w-16 text-center bg-white border border-neutral-200 text-sm px-2 py-1.5 rounded focus:outline-none" />
                                                 </div>
                                                 <button onClick={() => removeItem(t.id)} className="text-neutral-300 hover:text-red-500 px-2 transition opacity-100 md:opacity-0 group-hover:opacity-100">✕</button>
                                              </div>
                                           </div>`;

content = content.replaceAll(target2, replacement2);

fs.writeFileSync(file, content);
console.log('Done replacing chunks!');
