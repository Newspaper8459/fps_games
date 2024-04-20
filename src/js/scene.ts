import { type VRM, VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import {
  Scene,
  WebGLRenderer,
  PerspectiveCamera,
  Vector3,
  DirectionalLight,
  type AnimationClip,
  AnimationMixer,
  Clock,
  GridHelper,
  AxesHelper,
  Quaternion,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls";
import { loadMixamoAnimation } from "./loadMixamoAnimation";

// Animate
const canvas: HTMLElement = document.querySelector("canvas.webgl")!;

// Sizes
const sizes = {
  width: canvas.clientWidth,
  height: canvas.clientHeight,
};

const scene = new Scene();

// Renderer
const renderer = new WebGLRenderer({
  canvas,
});
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(1);

const camera = new PerspectiveCamera(75, sizes.width / sizes.height);
camera.position.set(0, 1.5, 0);

const controls = new PointerLockControls(camera, canvas);
scene.add(controls.getObject());

let prevTime = performance.now();

const light = new DirectionalLight(0xffffff);
light.position.set(-1, 1, -1).normalize();
scene.add(light);

let vrm: VRM;

const movement = {
  moveForward: false,
  moveBackward: false,
  moveLeft: false,
  moveRight: false,
  direction: new Vector3(),
  velocity: new Vector3(),
}

const animation = new Map<string, AnimationClip>();

let currentMixer: AnimationMixer;
let currentFBX = 'idle.fbx';

const clock = new Clock();

// const gridHelper = new GridHelper(10, 10);
// scene.add(gridHelper);

// const axesHelper = new AxesHelper(5);
// scene.add(axesHelper);


const init = (): void => {
  const loader = new GLTFLoader();
  loader.register((parser) => {
    return new VRMLoaderPlugin(parser, {
      // helperRoot: helperRoot,
      autoUpdateHumanBones: true,
    });
  });

  loader.load(
    "/vrm/VRM1_Constraint_Twist_Sample.vrm",
    (gltf) => {
      vrm = gltf.userData.vrm;

      console.log(vrm);

      vrm.firstPerson!.setup();
      camera.layers.enable(vrm.firstPerson!.firstPersonOnlyLayer);
      camera.layers.disable(vrm.firstPerson!.thirdPersonOnlyLayer);
      vrm.scene.traverse((obj) => {
        obj.frustumCulled = false;
      });
      VRMUtils.rotateVRM0(vrm);

      currentMixer = new AnimationMixer(vrm.scene);

      loadFBX()
        .then(() => {
          // console.log(animation.get('idle.fbx'));
          currentMixer.clipAction(animation.get("idle.fbx")!).play();
        })
        .catch((e) => {
          console.error(e);
        });

      // vrm.scene.add(camera)
      // scene.add(vrm.scene);

      scene.add(camera);
      scene.add(vrm.scene);
      // camera.add(vrm.scene);

      vrm.scene.position.set(0, 0, 0);

      console.log(scene);
    },

    (progress) => {
      console.log(
        "Loading model...",
        100.0 * (progress.loaded / progress.total),
        "%"
      );
    },

    (error) => {
      console.error(error);
    }
  );

  const playFBX = (name: string): void => {
    // console.log(name);
    // console.log(currentFBX);
    if(name === currentFBX) return;
    currentMixer.clipAction(animation.get(name)!).play();
    currentMixer.clipAction(animation.get(currentFBX)!).stop();
    currentFBX = name;
  }

  const onChange = (): void => {
    // console.log(movement.moveForward && !movement.moveBackward);
    if(movement.moveForward && !movement.moveBackward) playFBX('forward.fbx');
    else if(movement.moveBackward && !movement.moveForward) playFBX('backward.fbx');
    else if(movement.moveRight && !movement.moveLeft) playFBX('right.fbx');
    else if(movement.moveLeft && !movement.moveRight) playFBX('left.fbx');
    else playFBX('idle.fbx');
  };

  const watchValue = (prop: string): void => {
    let value = movement.direction[prop as keyof Vector3];
    Object.defineProperty(movement.direction, prop, {
      get: () => value,
      set: (newValue) => {
        if(value !== newValue) onChange();
        value = newValue;
      },
    });
  }

  ['x', 'z'].forEach((key) => {watchValue(key)});

  console.log(camera);
};

const initStage = async (): Promise<void> => {
  const loader = new GLTFLoader();
  loader.load("/glb/LibraryStage.glb", (object) => {
    scene.add(object.scene);
  });
};

init();
initStage()
  .then(() => {})
  .catch((e) => {
    console.error(e);
  });


const loadFBX = async (): Promise<void> => {
  const base = [
    'backward.fbx',
    'forward.fbx',
    'left.fbx',
    'right.fbx',
    'idle.fbx',
  ];

  for await (const fbx of base) {
    const clip = await loadMixamoAnimation('./fbx/'+fbx, vrm);
    animation.set(fbx, clip);
  }
}


const tick = (): void => {
  const time = performance.now();

  const deltaTime = clock.getDelta();

  if (vrm !== undefined && animation.size === 5) {
    // const v = new Vector3();
    // vrm.scene.getWorldPosition(v);
    // console.log(v);

    const delta = (time - prevTime)/1000;

    movement.velocity.x -= movement.velocity.x * 10.0 * delta;
    movement.velocity.z -= movement.velocity.z * 10.0 * delta;

    movement.direction.z = Number(movement.moveForward) - Number(movement.moveBackward);
    movement.direction.x = Number(movement.moveRight) - Number(movement.moveLeft);
    movement.direction.normalize();

    if(movement.moveForward || movement.moveBackward) movement.velocity.z -= movement.direction.z * 20.0 * delta;
    if(movement.moveLeft || movement.moveRight) movement.velocity.x -= movement.direction.x * 20.0 * delta;

    // console.log(movement.direction);
    controls.moveRight(-movement.velocity.x * delta);
    controls.moveForward(-movement.velocity.z * delta);


    // VRMと同期
    const v = new Vector3();
    camera.getWorldPosition(v);
    let [x, y, z] = v.toArray();
    vrm.scene.position.set(x, 0, z);

    const q = new Quaternion();
    camera.getWorldQuaternion(q);
    const q_ = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI);
    q.multiply(q_);
    let w: number;
    [x, y, z, w] = q.toArray();
    vrm.scene.quaternion.set(0, y, 0, w).normalize();

    vrm.update(deltaTime);
  }

  prevTime = time;

  if (currentMixer !== undefined) {
    // update the animation
    currentMixer.update(deltaTime);
  }

  // Render
  renderer.render(scene, camera);

  // Call tick again on the next frame
  window.requestAnimationFrame(tick);
};

tick();


const blocker = document.getElementById('blocker');

blocker?.addEventListener('click', () => {
  controls.lock();
});

controls.addEventListener('lock', () => {
  blocker!.style.display = 'none';
});

controls.addEventListener('unlock', () => {
  blocker!.style.display = 'block';
});

const onKeyDown = (e: KeyboardEvent): void => {
  switch(e.code){
    case 'ArrowUp':
    case 'KeyW':
      movement.moveForward = true;
      break;

    case 'ArrowLeft':
    case 'KeyA':
      movement.moveLeft = true;
      break;

    case 'ArrowDown':
    case 'KeyS':
      movement.moveBackward = true;
      break;

    case 'ArrowRight':
    case 'KeyD':
      movement.moveRight = true;
      break;
  }
}

const onKeyUp = (e: KeyboardEvent): void => {
  switch (e.code) {
    case "ArrowUp":
    case "KeyW":
      movement.moveForward = false;
      break;

    case "ArrowLeft":
    case "KeyA":
      movement.moveLeft = false;
      break;

    case "ArrowDown":
    case "KeyS":
      movement.moveBackward = false;
      break;

    case "ArrowRight":
    case "KeyD":
      movement.moveRight = false;
      break;
  }
};

document.addEventListener('keydown', onKeyDown);
document.addEventListener('keyup', onKeyUp);
