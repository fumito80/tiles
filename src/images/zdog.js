const illo = new Zdog.Illustration({
  // set canvas with selector
  element: '#zdog-svg',
  dragRotate: true,
  centered: true,
});

// const scene = new Zdog.Anchor();
// const TAU = Zdog.TAU;

// let isSpinning = true;

// ----- model ----- //

function makeConnet(x, y, width, rx) {
  const resizing = 30;
  const [init, ...paths] = [
    { x, y },
    { x: width - rx * 2 + resizing },
    { arc: [{ x: rx, y: 0 }, { x: rx, y: rx }] },
    { y: width - rx * 2 + resizing },
    { arc: [{ x: 0, y: rx }, { x: rx, y: rx }] },

    { x: width - rx * 2 },
    { arc: [{ x: rx, y: 0 }, { x: rx, y: rx }] },
    { y: width - rx * 2 },
    { arc: [{ x: 0, y: rx }, { x: -rx, y: rx }] },
    { x: -width + rx * 2 },

    { arc: [{ x: -rx, y: 0 }, { x: -rx, y: rx }] },
    { y: width - rx * 2 - resizing },
    { arc: [{ x: 0, y: rx }, { x: -rx, y: rx }] },
    { x: -width + rx * 2 + resizing },
    { arc: [{ x: -rx, y: 0 }, { x: -rx, y: -rx }] },
    { y: -width + rx * 2 + resizing },
    { arc: [{ x: 0, y: -rx }, { x: rx, y: -rx }] },
    { x: width - rx * 2 - resizing },
    { arc: [{ x: rx, y: 0 }, { x: rx, y: -rx }] },

    { y: -width + rx * 2 },
    { arc: [{ x: 0, y: -rx }, { x: -rx, y: -rx }] },
    { x: -width + rx * 2 - resizing },
    { arc: [{ x: -rx, y: 0 }, { x: -rx, y: -rx }] },
    { y: -width + rx * 2 - resizing },
    { arc: [{ x: 0, y: -rx }, { x: rx, y: -rx }] },
  ];
  const [result] = paths.reduce(([ret, { x: cx, y: cy }], path) => {
    if (path.arc) {
      const [arc1, arc2] = path.arc;
      const lastPos = { x: arc2.x + cx, y: arc2.y + cy };
      return [[...ret, { arc: [{ x: arc1.x + cx, y: arc1.y + cy }, lastPos] }], lastPos];
    }
    const lastPos = { x: (path.x ?? 0) + cx, y: (path.y ?? 0) + cy };
    return [[...ret, lastPos], lastPos];
  }, [[], init]);
  return [init, ...result];
}

const width2 = 600;
const rx2 = 50;
const rectWidth2 = 200;

new Zdog.Shape({
  addTo: illo,
  path: makeConnet(180, (width2 - rectWidth2 * 3) / 2, rectWidth2, rx2),
  translate: { x: -300, y: -300 },
  // translate: { y: 0, z: 300 },
  // rotate: { x: Zdog.TAU/8 },
  color: '#E62',
  stroke: 3,
  fill: true,
});

// const zdogSvg = document.getElementById('zdog-svg');

// function empty(element) {
//   while (element.firstChild) {
//     element.removeChild(element.firstChild);
//   }
// }

// function render() {
//   empty(zdogSvg);
//   scene.renderGraphSvg(zdogSvg);
// }

// function animate() {
//   scene.rotate.y += isSpinning ? 0.03 : 0;
//   scene.updateGraph();
//   render();
//   requestAnimationFrame(animate);
// }

// illo.updateRenderGraph();

function animate() {
  illo.updateRenderGraph();
  requestAnimationFrame(animate);
}
animate();

// animate();
// scene.renderGraphSvg(zdogSvg);
// scene.updateGraph();

// let dragStartRX;
// let dragStartRY;
// const minSize = Math.min(zdogSvg.getAttribute('width'), zdogSvg.getAttribute('height'));

// add drag-rotatation with Dragger
// new Zdog.Dragger({
//   startElement: zdogSvg,
//   onDragStart: function() {
//     isSpinning = false;
//     dragStartRX = scene.rotate.x;
//     dragStartRY = scene.rotate.y;
//   },
//   onDragMove: function( pointer, moveX, moveY ) {
//     scene.rotate.x = dragStartRX - ( moveY / minSize * TAU );
//     scene.rotate.y = dragStartRY - ( moveX / minSize * TAU );
//   },
// });
