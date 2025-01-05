import '../src/view/glyphs.css';

const paletts = [
  '3D405B', 'E07A5F', '81B29A', 'F4F1DE', 'F2CC8F',
  '1B4965', '5FA8D3', '62B6CB', 'BEE9E8', 'CAE9FF',
  'ebeae1', 'cbd9a0', 'fbb89e', 'e9f2c2', 'dba0a0',
  'F2EED3', 'AFCCE0', 'CF6F57', '82A2CF', 'BF3741',
];

const glyphs = [
  'icon-bookmarks',
  'icon-tabs',
  'icon-recently-closed-tab',
  'icon-history',
  'icon-bookmarks',
  'icon-tabs',
  'icon-history',
  'icon-bookmarks',
  'icon-recently-closed-window',
  'icon-recently-closed-tab',
  'icon-bookmarks',
  'icon-tabs',
  'icon-history',
  'icon-recently-closed-tab',
  'icon-history',
  'icon-recently-closed-window',
  'icon-bookmarks',
  'icon-tabs',
  'icon-history',
];

// const glyphs = [] as string[];
// const { length } = glyphsOrg;
// for (let i = 0; i < length; i += 1) {
//   const randomIndex = Math.floor((length - i) * Math.random());
//   const [randomPalette] = glyphsOrg.splice(randomIndex, 1);
//   glyphs.push(randomPalette);
// }

const [$canvas] = document.getElementsByClassName('canvas');

function getRGB(colorCode: string) {
  return [colorCode.substring(0, 2), colorCode.substring(2, 4), colorCode.substring(4, 6)]
    .map((hex) => parseInt(hex, 16));
}

function getColorWhiteness(colorCode: string) {
  const [r, g, b] = getRGB(colorCode);
  return Math.max(
    ((r || 1) * (g || 1) * (b || 1)) / (0xFF * 0xFF * 0xFF),
    (g * b) / (0xFF * 0xFF),
    (r * b) / (0xFF * 0xFF),
    (r * g) / (0xFF * 0xFF),
  );
}

const lightColorWhiteness = 0.6;
const lightColor = '#efefef';
const darkColor = '#222222';
const pIndex = 9;

function getColorFromBg(colorPalette: string[]) {
  return colorPalette
    .map((code) => [`#${code}`, getColorWhiteness(code)] as const)
    .map(([bgColor, whiteness]) => [bgColor, whiteness > lightColorWhiteness] as [string, boolean])
    .map(([bgColor, isLight]) => [bgColor, isLight ? darkColor : lightColor, isLight]);
}

function addRound(code: string) {
  const $el = $canvas.appendChild(document.createElement('div'));
  $el.style.backgroundColor = `#${code}`;
  return $el;
}

type SetSizeResult = [HTMLDivElement | undefined, number];

function setSize(acc: SetSizeResult[], $el: HTMLDivElement) {
  const [[, size], ...rest] = acc;
  const newSize = size || Math.min($el.offsetHeight, $el.offsetWidth);
  $el.style.setProperty('width', `${newSize}px`);
  $el.style.setProperty('height', `${newSize}px`);
  return [...(size === 0 ? rest : acc), [$el, newSize]] as SetSizeResult[];
}

function setP([$el]: SetSizeResult, index: number) {
  if (index === pIndex) {
    $el!.appendChild(document.getElementsByClassName('P')[0]) as SVGElement;
  }
  return $el!;
}

function addGlyphs($el: HTMLDivElement, index: number) {
  if (index === pIndex) {
    return $el;
  }
  const $i = $el.appendChild(document.createElement('i'));
  $i.className = glyphs[index > pIndex ? index - 1 : index];
  const [, r, g, b] = /(\d+),\s(\d+),\s(\d+)/.exec($el.style.backgroundColor) || [];
  const code = [r, g, b].map((c) => Number(c!).toString(16)).map((c) => c.padStart(2, '0')).join('');
  const [[, , isLight]] = getColorFromBg([code]) as [string, string, boolean][];
  let opacity = '.3';
  if (['icon-bookmarks', 'icon-tabs', 'icon-history'].includes($i.className)) {
    opacity = '.3';
  }
  $el.style.setProperty('color', isLight ? `rgba(0, 0, 0, ${opacity})` : `rgba(255, 255, 255, ${opacity})`);
  return $el;
}

paletts
  .map(addRound)
  .reduce(setSize, [[undefined, 0]] as SetSizeResult[])
  .map(setP)
  .map(addGlyphs);
