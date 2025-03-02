import * as THREE from 'three';
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader';
import { SVGRenderer } from 'three/examples/jsm/renderers/SVGRenderer';

const svgSize = 600;

declare global {
  interface Window {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
  }
}

let renderer: SVGRenderer; // THREE.WebGLRenderer;
// window.scene: THREE.Scene;
// window.camera: THREE.PerspectiveCamera;
let gui: GUI;
let guiData: {
  drawFillShapes: any;
  fillShapesWireframe: any;
  drawStrokes: any;
  strokesWireframe: any;
  currentURL: any;
};

function render() {
  renderer.render(window.scene, window.camera);
}

function onWindowResize() {
  // window.camera.aspect = window.innerWidth / window.innerHeight;
  window.camera.aspect = 1;
  window.camera.updateProjectionMatrix();

  // renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setSize(svgSize, svgSize);
  render();
}

function loadSVG(url: string) {
  window.scene = new THREE.Scene();
  window.scene.background = new THREE.Color(0xb0b0b0);

  const helper = new THREE.GridHelper(160, 10, 0x8d8d8d, 0xc1c1c1);
  helper.rotation.x = Math.PI / 2;
  window.scene.add(helper);

  const loader = new SVGLoader();

  loader.load(url, (data: { paths: any; }) => {
    const group = new THREE.Group();
    group.scale.multiplyScalar(0.25);
    group.position.x = -70;
    group.position.y = 70;
    group.scale.y *= -1;

    let renderOrder = 0;

    // eslint-disable-next-line no-restricted-syntax
    for (const path of data.paths) {
      const fillColor = path.userData.style.fill;

      if (guiData.drawFillShapes && fillColor !== undefined && fillColor !== 'none') {
        const material = new THREE.MeshBasicMaterial({
          color: new THREE.Color().setStyle(fillColor),
          opacity: path.userData.style.fillOpacity,
          transparent: true,
          side: THREE.DoubleSide,
          depthWrite: false,
          wireframe: guiData.fillShapesWireframe,
        });

        const shapes = SVGLoader.createShapes(path);

        // eslint-disable-next-line no-restricted-syntax
        for (const shape of shapes) {
          const geometry = new THREE.ShapeGeometry(shape);
          const mesh = new THREE.Mesh(geometry, material);
          renderOrder += 1;
          mesh.renderOrder = renderOrder;

          group.add(mesh);
        }
      }

      const strokeColor = path.userData.style.stroke;

      if (guiData.drawStrokes && strokeColor !== undefined && strokeColor !== 'none') {
        const material = new THREE.MeshBasicMaterial({
          color: new THREE.Color().setStyle(strokeColor),
          opacity: path.userData.style.strokeOpacity,
          transparent: true,
          side: THREE.DoubleSide,
          depthWrite: false,
          wireframe: guiData.strokesWireframe,
        });

        // eslint-disable-next-line no-restricted-syntax
        for (const subPath of path.subPaths) {
          const geometry = SVGLoader.pointsToStroke(subPath.getPoints(), path.userData.style);

          if (geometry) {
            const mesh = new THREE.Mesh(geometry, material);
            renderOrder += 1;
            mesh.renderOrder = renderOrder;

            group.add(mesh);
          }
        }
      }
    }

    window.scene.add(group);

    render();
  });
}

function createGUI() {
  function update() {
    loadSVG(guiData.currentURL);
  }

  if (gui) gui.destroy();

  gui = new GUI();

  gui.add(guiData, 'currentURL', {
    Tiles: 'models/svg/tiles.svg',
    Tiger: 'models/svg/tiger.svg',
    'Joins and caps': 'models/svg/lineJoinsAndCaps.svg',
    Hexagon: 'models/svg/hexagon.svg',
    Energy: 'models/svg/energy.svg',
    'Test 1': 'models/svg/tests/1.svg',
    'Test 2': 'models/svg/tests/2.svg',
    'Test 3': 'models/svg/tests/3.svg',
    'Test 4': 'models/svg/tests/4.svg',
    'Test 5': 'models/svg/tests/5.svg',
    'Test 6': 'models/svg/tests/6.svg',
    'Test 7': 'models/svg/tests/7.svg',
    'Test 8': 'models/svg/tests/8.svg',
    'Test 9': 'models/svg/tests/9.svg',
    Units: 'models/svg/tests/units.svg',
    Ordering: 'models/svg/tests/ordering.svg',
    Defs: 'models/svg/tests/testDefs/Svg-defs.svg',
    Defs2: 'models/svg/tests/testDefs/Svg-defs2.svg',
    Defs3: 'models/svg/tests/testDefs/Wave-defs.svg',
    Defs4: 'models/svg/tests/testDefs/defs4.svg',
    Defs5: 'models/svg/tests/testDefs/defs5.svg',
    'Style CSS inside defs': 'models/svg/style-css-inside-defs.svg',
    'Multiple CSS classes': 'models/svg/multiple-css-classes.svg',
    'Zero Radius': 'models/svg/zero-radius.svg',
    'Styles in svg tag': 'models/svg/tests/styles.svg',
    'Round join': 'models/svg/tests/roundJoinPrecisionIssue.svg',
    'Ellipse Transformations': 'models/svg/tests/ellipseTransform.svg',
    singlePointTest: 'models/svg/singlePointTest.svg',
    singlePointTest2: 'models/svg/singlePointTest2.svg',
    singlePointTest3: 'models/svg/singlePointTest3.svg',
    emptyPath: 'models/svg/emptyPath.svg',

  }).name('SVG File').onChange(update);

  gui.add(guiData, 'drawStrokes').name('Draw strokes').onChange(update);
  gui.add(guiData, 'drawFillShapes').name('Draw fill shapes').onChange(update);
  gui.add(guiData, 'strokesWireframe').name('Wireframe strokes').onChange(update);
  gui.add(guiData, 'fillShapesWireframe').name('Wireframe fill shapes').onChange(update);
}

function init() {
  const container = document.getElementById('container');

  // window.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight,
  //  1, 1000);
  window.camera = new THREE.PerspectiveCamera(50, 1, 1, 1000);
  window.camera.position.set(0, 0, 200);

  // renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer = new SVGRenderer();
  // renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setPixelRatio();
  // renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setSize(svgSize, svgSize);
  container?.appendChild(renderer.domElement);

  // const controls = new OrbitControls(camera, renderer.domElement);
  const controls = new OrbitControls(window.camera, renderer.domElement as unknown as HTMLElement);
  controls.addEventListener('change', render);
  controls.screenSpacePanning = true;

  window.addEventListener('resize', onWindowResize);

  guiData = {
    currentURL: 'models/svg/tiles.svg',
    drawFillShapes: true,
    drawStrokes: true,
    fillShapesWireframe: false,
    strokesWireframe: false,
  };

  loadSVG(guiData.currentURL);

  createGUI();
}

init();
