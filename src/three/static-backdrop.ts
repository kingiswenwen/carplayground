import * as T from 'three';

// The software renderer can reuse opaque scenery while the camera is still.
// Keeping the depth texture means a moving prop still passes behind scenery.
const staticLayer = 1;

export class StaticBackdrop {
  private target = new T.WebGLRenderTarget(1, 1, {
    type: T.HalfFloatType,
    minFilter: T.NearestFilter,
    magFilter: T.NearestFilter,
    depthTexture: new T.DepthTexture(1, 1),
  });
  private quad = new T.Mesh(new T.PlaneGeometry(2, 2), new T.ShaderMaterial({
    uniforms: {
      backdrop: {value: this.target.texture},
      backdropDepth: {value: this.target.depthTexture},
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform sampler2D backdrop;
      uniform sampler2D backdropDepth;
      void main() {
        float depth = texture2D(backdropDepth, vUv).r;
        gl_FragColor = texture2D(backdrop, vUv);
        gl_FragDepth = depth;
        // The paper background in the original scene skips tone mapping.
        if (depth < 1.0) {
          #include <tonemapping_fragment>
        }
        #include <colorspace_fragment>
      }
    `,
    depthFunc: T.AlwaysDepth,
  }));
  private composite = new T.Scene();
  private size = new T.Vector2();
  private capturedSize = new T.Vector2();
  private cameraTransform = new T.Matrix4();
  private cameraProjection = new T.Matrix4();
  private dirty = true;

  constructor(rendererScene: T.Scene, objects: T.Object3D[]) {
    for (const object of objects) object.traverse(child => child.layers.set(staticLayer));
    for (const object of rendererScene.children) {
      if (object instanceof T.Light) object.layers.enable(staticLayer);
    }
    this.quad.frustumCulled = false;
    this.composite.add(this.quad);
  }

  invalidate() {
    this.dirty = true;
  }

  render(renderer: T.WebGLRenderer, scene: T.Scene, camera: T.PerspectiveCamera) {
    renderer.getDrawingBufferSize(this.size);
    camera.updateMatrixWorld();

    const viewChanged = !this.capturedSize.equals(this.size)
      || !this.cameraTransform.equals(camera.matrixWorld)
      || !this.cameraProjection.equals(camera.projectionMatrix);
    const layers = camera.layers.mask;
    const background = scene.background;
    const target = renderer.getRenderTarget();
    const autoClear = renderer.autoClear;

    try {
      if (viewChanged) {
        // Render directly while orbiting or resizing. Capture once it settles.
        this.capturedSize.copy(this.size);
        this.cameraTransform.copy(camera.matrixWorld);
        this.cameraProjection.copy(camera.projectionMatrix);
        this.dirty = true;
        camera.layers.enable(staticLayer);
        renderer.render(scene, camera);
        return;
      }

      if (this.dirty) {
        this.target.setSize(this.size.x, this.size.y);
        camera.layers.set(staticLayer);
        renderer.setRenderTarget(this.target);
        renderer.render(scene, camera);
        renderer.setRenderTarget(target);
        this.dirty = false;
      }

      camera.layers.mask = layers;
      renderer.render(this.composite, camera);
      scene.background = null;
      renderer.autoClear = false;
      renderer.render(scene, camera);
    } finally {
      scene.background = background;
      camera.layers.mask = layers;
      renderer.autoClear = autoClear;
      if (renderer.getRenderTarget() !== target) renderer.setRenderTarget(target);
    }
  }

  dispose() {
    this.target.dispose();
    this.quad.geometry.dispose();
    this.quad.material.dispose();
  }
}
