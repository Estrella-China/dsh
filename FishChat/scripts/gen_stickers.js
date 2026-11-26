'use strict';

// 生成 12 个 QQ 风格的简单表情贴纸（SVG），输出到 renderer/stickers/
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'renderer', 'stickers');
fs.mkdirSync(OUT, { recursive: true });

const FACE = '#FFD93B';
const STROKE = '#E5B62A';
const INK = '#4A3A08';

function star(cx, cy, r, fill) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const ang = (Math.PI / 5) * i - Math.PI / 2;
    const rad = i % 2 === 0 ? r : r * 0.45;
    pts.push(`${(cx + rad * Math.cos(ang)).toFixed(1)},${(cy + rad * Math.sin(ang)).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}"/>`;
}

function base(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
  <circle cx="60" cy="60" r="50" fill="${FACE}" stroke="${STROKE}" stroke-width="3"/>
  ${inner}
</svg>
`;
}

function eyes(r = 5.5) {
  return `<g fill="${INK}">
    <ellipse cx="42" cy="48" rx="${r}" ry="${r + 1}"/>
    <ellipse cx="78" cy="48" rx="${r}" ry="${r + 1}"/>
  </g>`;
}

const MOUTHS = {
  smile: `<path d="M40 72 Q60 92 80 72" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>`,
  bigLaugh: `<path d="M38 68 Q60 98 82 68 Z" fill="${INK}"/><path d="M52 84 Q60 92 68 84" fill="none" stroke="#FF7B7B" stroke-width="4" stroke-linecap="round"/>`,
  sad: `<path d="M48 84 Q60 74 72 84" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>`,
  down: `<path d="M46 82 Q60 70 74 82" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>`,
  o: `<ellipse cx="60" cy="80" rx="7" ry="9" fill="${INK}"/>`,
  small: `<path d="M50 78 Q60 84 70 78" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`,
  flat: `<path d="M50 80 L70 80" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>`,
};

const stickers = {
  '01.svg': base(`${eyes()}
  <circle cx="30" cy="66" r="6" fill="#FF9D9D" opacity="0.75"/>
  <circle cx="90" cy="66" r="6" fill="#FF9D9D" opacity="0.75"/>
  ${MOUTHS.smile}`),
  '02.svg': base(`${eyes()}
  <circle cx="30" cy="68" r="6" fill="#FF9D9D" opacity="0.75"/>
  <circle cx="90" cy="68" r="6" fill="#FF9D9D" opacity="0.75"/>
  ${MOUTHS.bigLaugh}`),
  '03.svg': base(`${eyes(5)}
  ${MOUTHS.sad}
  <ellipse cx="86" cy="64" rx="4.5" ry="8" fill="#6EC1FF" opacity="0.9"/>`),
  '04.svg': base(`${eyes(5)}
  ${MOUTHS.sad}
  <ellipse cx="34" cy="62" rx="4.5" ry="8" fill="#6EC1FF" opacity="0.9"/>
  <ellipse cx="86" cy="62" rx="4.5" ry="8" fill="#6EC1FF" opacity="0.9"/>`),
  '05.svg': base(`${eyes(5)}
  <path d="M30 36 L54 46" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>
  <path d="M90 36 L66 46" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>
  ${MOUTHS.down}`),
  '06.svg': base(`${eyes(6.5)}
  ${MOUTHS.o}`),
  '07.svg': base(`${eyes(4.5)}
  <circle cx="30" cy="66" r="7" fill="#FF9D9D" opacity="0.85"/>
  <circle cx="90" cy="66" r="7" fill="#FF9D9D" opacity="0.85"/>
  ${MOUTHS.small}`),
  '08.svg': base(`${eyes(4.5)}
  <path d="M32 34 L52 42" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>
  <path d="M88 34 L70 40" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>
  ${MOUTHS.flat}
  <text x="100" y="34" font-size="24" font-weight="bold" fill="${INK}" font-family="Microsoft YaHei, sans-serif">?</text>`),
  '09.svg': base(`${star(22, 28, 9, '#FF9F1A')}
  ${star(100, 24, 7, '#FF9F1A')}
  ${eyes()}
  ${MOUTHS.smile}`),
  '10.svg': base(`<g fill="${INK}">
    <ellipse cx="42" cy="48" rx="5.5" ry="6.5"/>
    <ellipse cx="78" cy="48" rx="5.5" ry="6.5"/>
    <path d="M34 48 Q42 42 50 48" fill="none" stroke="${INK}" stroke-width="2.5" opacity="0"/>
  </g>
  ${MOUTHS.o}
  <text x="96" y="34" font-size="20" font-weight="bold" fill="#6EC1FF" font-family="Microsoft YaHei, sans-serif">z</text>
  <text x="104" y="20" font-size="14" font-weight="bold" fill="#6EC1FF" font-family="Microsoft YaHei, sans-serif">z</text>`),
  '11.svg': base(`${eyes()}
  <text x="60" y="94" font-size="20" font-weight="bold" fill="${INK}" text-anchor="middle" font-family="Microsoft YaHei, sans-serif">666</text>`),
  '12.svg': base(`${eyes(4.5)}
  <path d="M36 78 L54 92 L84 54" fill="none" stroke="#2E9E44" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`),
};

for (const [file, svg] of Object.entries(stickers)) {
  fs.writeFileSync(path.join(OUT, file), svg, 'utf8');
}
console.log('stickers written:', Object.keys(stickers).length);
