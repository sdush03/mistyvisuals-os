const fs = require('fs');
let code = fs.readFileSync('frontend/components/StoryViewer.tsx', 'utf8');

// Global changes (wrapper)
code = code.replace(/bg-black/g, 'bg-[#FAF9F6]');
code = code.replace(/bg-\[\#0A0A0A\]/, 'bg-[#F4F4F5]');
code = code.replace(/bg-\[\#0A0A0B\]/g, 'bg-[#FAF9F6]');
// Progress bars
code = code.replace(/bg-white\/20 rounded-full/g, 'bg-neutral-900/10 rounded-full');
code = code.replace(/bg-white transition-all/g, 'bg-neutral-900 transition-all');

// Modals/Pills
code = code.replace(/bg-amber-500 text-black/g, 'bg-neutral-900 text-white');

// SlideCover
code = code.replace(/from-black\/80 via-transparent to-black\/95/g, 'from-[#FAF9F6]/90 via-[#FAF9F6]/30 to-[#FAF9F6]');
code = code.replace(/text-white\/50 font-bold mb-4/g, 'text-neutral-500 font-bold mb-4');
code = code.replace(/text-white\/90 mb-6/g, 'text-neutral-700 mb-6');
code = code.replace(/bg-white\/30 mx-auto/g, 'bg-neutral-300 mx-auto');
code = code.replace(/text-white tracking-tighter/g, 'text-neutral-900 tracking-tighter');
code = code.replace(/text-white\/70/g, 'text-neutral-500');
code = code.replace(/text-white\/40 text-\[9px\]/g, 'text-neutral-400 text-[9px]');
code = code.replace(/<span className="text-white\/30">•<\/span>/g, '<span className="text-neutral-300">•</span>');
code = code.replace(/drop-shadow-2xl/g, 'drop-shadow-sm');

// SlideMoodboard
code = code.replace(/bg-neutral-950 flex flex-col/g, 'bg-[#FAF9F6] flex flex-col');
code = code.replace(/text-white\/90 leading-tight/g, 'text-neutral-900 leading-tight');
code = code.replace(/bg-white\/30 mt-4/g, 'bg-neutral-300 mt-4');
code = code.replace(/bg-black\/0 group-hover:bg-black\/10/g, 'bg-white/0 group-hover:bg-white/30');

// SlideEvent
// Ensure fallback without image matches light mode bg
code = code.replace(/bg-neutral-900/g, 'bg-[#F2F0EB]'); 
code = code.replace(/from-black via-black\/80 to-black\/40/g, 'from-[#FAF9F6] via-[#FAF9F6]/80 to-[#FAF9F6]/40');
code = code.replace(/text-white\/50 font-bold border border-white\/20/g, 'text-neutral-500 font-bold border border-neutral-900/10');
code = code.replace(/text-white tracking-tight drop-shadow-lg/g, 'text-neutral-900 tracking-tight');
// Allocated Crew block
code = code.replace(/bg-black\/40 backdrop-blur-md border border-white\/10 shadow-2xl/g, 'bg-white/60 backdrop-blur-md border border-neutral-900/5 shadow-xl');
code = code.replace(/text-emerald-400/g, 'text-emerald-700');
code = code.replace(/text-white\/90 border-b border-white\/5/g, 'text-neutral-800 border-b border-neutral-900/5');
code = code.replace(/bg-white\/10 text-white/g, 'bg-neutral-900/5 text-neutral-800');
// Event details grid
code = code.replace(/border-white\/10 pt-6 bg-gradient-to-t from-black\/60 to-transparent/g, 'border-neutral-900/10 pt-6 bg-gradient-to-t from-[#FAF9F6]/80 to-transparent');
code = code.replace(/text-white\/40 mb-1/g, 'text-neutral-500 mb-1');
code = code.replace(/text-white\/90 drop-shadow-sm/g, 'text-neutral-800');

// SlideDeliverables
code = code.replace(/text-white tracking-tight/g, 'text-neutral-900 tracking-tight');
code = code.replace(/text-neutral-400 mt-2 mb-10/g, 'text-neutral-500 mt-2 mb-10');
code = code.replace(/bg-white\/\[0.03\]/g, 'bg-white/70');
code = code.replace(/border border-white\/10 shadow-2xl/g, 'border border-neutral-900/5 shadow-xl');
code = code.replace(/text-white\/40 leading-relaxed/g, 'text-neutral-500 leading-relaxed');
code = code.replace(/text-white\/40 text-sm italic/g, 'text-neutral-400 text-sm italic');
code = code.replace(/bg-white\/5 rounded-2xl border border-white\/5/g, 'bg-black/5 rounded-2xl border border-black/5');

// SlideInvestment
code = code.replace(/bg-neutral-950 animate-in/g, 'bg-[#FAF9F6] animate-in');
code = code.replace(/from-neutral-800 to-neutral-900 border border-neutral-700\/50/g, 'from-white to-white/50 border border-neutral-900/5');
code = code.replace(/bg-white\/5 rounded-full/g, 'bg-neutral-900/5 rounded-full');
code = code.replace(/text-white\/40 line-through/g, 'text-neutral-400 line-through');
code = code.replace(/text-white z-10/g, 'text-neutral-900 z-10');
// Package breakdown lines
code = code.replace(/text-white\/50 mb-4 px-2/g, 'text-neutral-500 mb-4 px-2');
code = code.replace(/border-b border-white\/5/g, 'border-b border-neutral-900/5');
code = code.replace(/text-white\/80/g, 'text-neutral-800');
code = code.replace(/text-white\/40 font-normal/g, 'text-neutral-400 font-normal');
code = code.replace(/border border-white\/5 bg-white\/5/g, 'border border-emerald-900/10 bg-emerald-900/5');
// Payment milestones
code = code.replace(/bg-neutral-900\/50 rounded-xl/g, 'bg-white border border-neutral-900/5 shadow-sm rounded-xl');
code = code.replace(/text-white text-right/g, 'text-neutral-900 text-right');
code = code.replace(/from-neutral-950 via-neutral-950 to-transparent/g, 'from-[#FAF9F6] via-[#FAF9F6] to-transparent');
code = code.replace(/bg-neutral-700 text-white cursor-not-allowed/g, 'bg-neutral-200 text-neutral-500 cursor-not-allowed');
code = code.replace(/bg-white text-black/g, 'bg-neutral-900 text-white');

// SlideConnect
code = code.replace(/text-white leading-tight/g, 'text-neutral-900 leading-tight');
code = code.replace(/bg-white\/5 flex items-center/g, 'bg-neutral-900/5 flex items-center');
code = code.replace(/text-white\/50 text-sm/g, 'text-neutral-600 text-sm');
// the svg/icons might need text color changes later if svgs
code = code.replace(/border-t border-white\/10 pt-6/g, 'border-t border-neutral-900/10 pt-6');
code = code.replace(/text-white tracking-widest/g, 'text-neutral-500 tracking-widest');
code = code.replace(/text-3xl\">👋/g, 'text-3xl drop-shadow-sm\">👋');

fs.writeFileSync('frontend/components/StoryViewer.tsx', code, 'utf8');
console.log('StoryViewer converted to light mode!');
