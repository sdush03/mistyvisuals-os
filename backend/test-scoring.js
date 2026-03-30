const notesText = "client has a wedding in resort and they want candid aesthetic shots. it's a sundowner wedding".toLowerCase();
const pTags = ['candid', 'aesthetic', 'resort', 'sundowner', 'wedding', 'day', 'couple', 'local'];

let score = 0;
for (const t of pTags) {
    if (notesText.includes(t) && t.length > 3) {
        console.log(`Matched tag from notes: "${t}" (+1 pt)`);
        score += 1;
    }
}
console.log(`Total notes boost: +${score}`);
