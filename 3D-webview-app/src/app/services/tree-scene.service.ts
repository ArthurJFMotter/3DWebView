import { Injectable, ElementRef, NgZone } from '@angular/core';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Subject } from 'rxjs';
import { EulerRotation, Vector3D } from './topology-state.service';

interface PortInfo {
    mesh: THREE.Mesh;
    originalColor: THREE.Color;
    originalEmissive: THREE.Color;
    blinking?: boolean;
    blinkOn?: boolean;
    lastBlinkTime?: number;
    currentState?: string;
}

interface LoadedModel {
    id: string; // Unique instance ID
    object: THREE.Group; // The root THREE.Object3D for this model instance
    portIndicators: { [portName: string]: PortInfo };
    portAttachPoints: { [attachName: string]: THREE.Object3D };
}

interface CableInfo {
    id: string;
    object: THREE.Group; // or THREE.LineSegments, THREE.Mesh
    source: { modelId: string, portAttachName: string };
    target: { modelId: string, portAttachName: string };
}

const BLINK_INTERVAL = 500;

@Injectable({
    providedIn: 'root'
})
export class ThreeSceneService {
    private scene!: THREE.Scene;
    private camera!: THREE.PerspectiveCamera;
    private renderer!: THREE.WebGLRenderer;
    private controls!: OrbitControls;
    private loader = new GLTFLoader();
    private raycaster = new THREE.Raycaster();
    private mouse = new THREE.Vector2();

    private loadedModels: { [modelInstanceId: string]: LoadedModel } = {};
    private cables: { [cableId: string]: CableInfo } = {}; // Manage cables

    public onObjectSelected = new Subject<{ modelId: string, objectName: string, objectType: 'port' | 'device' }>();


    constructor(private ngZone: NgZone) { }

    initScene(canvas: HTMLCanvasElement): void {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xf0f0f0);

        this.camera = new THREE.PerspectiveCamera(15, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
        // Adjust these X, Y, Z values as needed.
        this.camera.position.set(0, 1, 3);

        this.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });

        this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        // this.renderer.outputEncoding = THREE.sRGBEncoding; // For better colors if using PBR

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 10, 7);
        this.scene.add(directionalLight);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;

        window.addEventListener('resize', this.onWindowResize.bind(this));
        canvas.addEventListener('click', this.onCanvasClick.bind(this));
    }

    async addModelToScene(
        modelUrl: string,
        modelInstanceId: string,
        position?: Vector3D, // <<--- CHANGED TYPE
        rotation?: EulerRotation  // <<--- CHANGED TYPE
    ): Promise<void> {
        if (this.loadedModels[modelInstanceId]) {
            console.warn(`Model with ID ${modelInstanceId} already loaded.`);
            return;
        }
        try {
            const gltf = await this.loader.loadAsync(modelUrl);
            const modelRoot = gltf.scene;
            modelRoot.name = modelInstanceId;

            if (position) {
                modelRoot.position.set(position.x, position.y, position.z); // <<--- CONVERT HERE
            }
            if (rotation) {
                // THREE.Euler.set(x, y, z, order?)
                modelRoot.rotation.set(rotation.x, rotation.y, rotation.z, rotation.order as THREE.EulerOrder); // <<--- CONVERT HERE
            }

            this.scene.add(modelRoot);

            const modelEntry: LoadedModel = {
                id: modelInstanceId,
                object: modelRoot,
                portIndicators: {},
                portAttachPoints: {}
            };

            modelRoot.traverse((child) => {
                if (child instanceof THREE.Mesh && child.name.endsWith('_Indicator')) {
                    // Assumes standard naming: ModelType_PortXX_Indicator
                    const portName = child.name; // Use the full unique name from Blender
                    child.material = (child.material as THREE.Material).clone(); // Crucial!
                    modelEntry.portIndicators[portName] = {
                        mesh: child,
                        originalColor: (child.material as THREE.MeshStandardMaterial).color.clone(),
                        originalEmissive: (child.material as THREE.MeshStandardMaterial).emissive.clone(),
                    };
                    this.setPortState(modelInstanceId, portName, 'inactive', false); // Initialize
                } else if (child.name.endsWith('_Attach')) {
                    // Assumes standard naming: ModelType_PortXX_Attach
                    modelEntry.portAttachPoints[child.name] = child;
                }
            });
            this.loadedModels[modelInstanceId] = modelEntry;
            console.log(`Model ${modelInstanceId} loaded from ${modelUrl}`, modelEntry);

        } catch (error) {
            console.error(`Error loading model ${modelUrl}:`, error);
        }
    }

    removeModelFromScene(modelInstanceId: string): void {
        const modelData = this.loadedModels[modelInstanceId];
        if (modelData) {
            // Remove associated cables first
            Object.keys(this.cables).forEach(cableId => {
                const cable = this.cables[cableId];
                if (cable.source.modelId === modelInstanceId || cable.target.modelId === modelInstanceId) {
                    this.disconnectCable(cableId);
                }
            });

            this.scene.remove(modelData.object);
            // Proper disposal of geometries and materials is important for memory
            modelData.object.traverse(child => {
                if (child instanceof THREE.Mesh) {
                    child.geometry.dispose();
                    if (Array.isArray(child.material)) {
                        child.material.forEach(material => material.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
            delete this.loadedModels[modelInstanceId];
            console.log(`Model ${modelInstanceId} removed.`);
        }
    }


    setPortState(modelInstanceId: string, portName: string, state: 'active' | 'inactive' | 'error' | string, blinking: boolean): void {
        const modelData = this.loadedModels[modelInstanceId];
        if (!modelData || !modelData.portIndicators[portName]) {
            // console.warn(`Port ${portName} on model ${modelInstanceId} not found for setting state.`);
            return;
        }

        const portInfo = modelData.portIndicators[portName];
        const material = portInfo.mesh.material as THREE.MeshStandardMaterial; // Or MeshBasicMaterial

        portInfo.blinking = blinking;
        portInfo.currentState = state;

        switch (state) {
            case 'active':
                material.color.set(0x00ff00); // Green
                material.emissive.set(blinking ? 0x003300 : 0x008800); // Slightly different for blinking base
                break;
            case 'inactive':
                material.color.set(0x808080); // Gray
                material.emissive.set(0x000000);
                portInfo.blinking = false; // Inactive ports usually don't blink
                break;
            case 'error':
                material.color.set(0xff0000); // Red
                material.emissive.set(blinking ? 0x330000 : 0x880000);
                break;
            default: // Custom color/state
                material.color.set(state); // Assuming state is a hex color string if not predefined
                material.emissive.set(0x000000); // Default no emission
        }
        // Update any connected cable
        this.updateCableVisualsForPort(modelInstanceId, portName);
    }

    private updateBlinkingPorts(): void {
        const currentTime = Date.now();
        for (const modelId in this.loadedModels) {
            const modelData = this.loadedModels[modelId];
            for (const portName in modelData.portIndicators) {
                const portInfo = modelData.portIndicators[portName];
                if (portInfo.blinking && portInfo.mesh) {
                    const material = portInfo.mesh.material as THREE.MeshStandardMaterial;
                    if (!portInfo.lastBlinkTime || (currentTime - portInfo.lastBlinkTime > BLINK_INTERVAL)) {
                        portInfo.lastBlinkTime = currentTime;
                        portInfo.blinkOn = !portInfo.blinkOn;

                        if (portInfo.blinkOn) {
                            if (portInfo.currentState === 'active') material.emissive.set(0x00ff00);
                            else if (portInfo.currentState === 'error') material.emissive.set(0xff0000);
                            // Add other blinking states
                        } else {
                            if (portInfo.currentState === 'active') material.emissive.set(0x003300);
                            else if (portInfo.currentState === 'error') material.emissive.set(0x330000);
                            // Add other blinking states
                        }
                    }
                }
            }
        }
    }

    // --- Cable Logic --- (More advanced, needs careful implementation)
    async connectCable(
        cableModelUrl: string, // URL for the cable model GLB itself
        cableInstanceId: string,
        source: { modelId: string, portAttachName: string },
        target: { modelId: string, portAttachName: string }
    ): Promise<void> {
        const sourceModel = this.loadedModels[source.modelId];
        const targetModel = this.loadedModels[target.modelId];

        if (!sourceModel || !targetModel) {
            console.error("Source or target model for cable not found.");
            return;
        }

        const sourceAttachPoint = sourceModel.portAttachPoints[source.portAttachName];
        const targetAttachPoint = targetModel.portAttachPoints[target.portAttachName];

        if (!sourceAttachPoint || !targetAttachPoint) {
            console.error("Source or target attachment point for cable not found.");
            return;
        }

        // For simple line cables:
        // const material = new THREE.LineBasicMaterial({ color: 0x555555, linewidth: 2 }); // Linewidth might not work on all systems
        // const points = [];
        // const sourcePos = sourceAttachPoint.getWorldPosition(new THREE.Vector3());
        // const targetPos = targetAttachPoint.getWorldPosition(new THREE.Vector3());
        // points.push(sourcePos);
        // points.push(targetPos);
        // const geometry = new THREE.BufferGeometry().setFromPoints(points);
        // const line = new THREE.Line(geometry, material);
        // line.name = cableInstanceId;
        // this.scene.add(line);
        // this.cables[cableInstanceId] = { id: cableInstanceId, object: line, source, target };

        // For GLB cables (more complex positioning/scaling/deformation needed):
        try {
            const gltf = await this.loader.loadAsync(cableModelUrl);
            const cableObject = gltf.scene;
            cableObject.name = cableInstanceId;

            // --- This is the tricky part: Orienting and scaling the cable model ---
            // You'll need to:
            // 1. Get world positions of source and target attach points.
            // 2. Calculate the vector between them.
            // 3. Set the cable's position (e.g., midpoint or one end).
            // 4. Orient the cable to align with the vector.
            // 5. Scale the cable along its length to fit.
            // This might involve a "bone" or specific orientation of your cable model in Blender.
            // A common approach is to have the cable model aligned along an axis (e.g., X)
            // and its origin at one end.
            const sourcePos = sourceAttachPoint.getWorldPosition(new THREE.Vector3());
            const targetPos = targetAttachPoint.getWorldPosition(new THREE.Vector3());

            const direction = new THREE.Vector3().subVectors(targetPos, sourcePos);
            const length = direction.length();
            cableObject.position.copy(sourcePos);
            cableObject.lookAt(targetPos); // Orients it

            // Assuming cable model is 1 unit long and aligned to its local Z axis
            // You'd adjust this based on your cable model's actual dimensions and orientation
            // For instance, if your cable model's length is along X and it's 1 unit long:
            // cableObject.scale.set(length, 1, 1); 
            // This is a simplification. True deformation or IK is more complex.
            // For now, let's just place it and you can refine:
            // A simple cylinder cable might be easier to start with programmatically.
            const cylinderGeo = new THREE.CylinderGeometry(0.05, 0.05, length, 8); // radiusTop, radiusBottom, height, radialSegments
            const cylinderMat = new THREE.MeshStandardMaterial({ color: 0x555555 });
            const cableMesh = new THREE.Mesh(cylinderGeo, cylinderMat);

            // Position cylinder at midpoint and orient it
            cableMesh.position.copy(sourcePos).add(direction.multiplyScalar(0.5));
            // Align cylinder's Y-axis with the direction vector
            cableMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
            cableMesh.name = cableInstanceId;

            this.scene.add(cableMesh);
            this.cables[cableInstanceId] = { id: cableInstanceId, object: cableMesh as any, source, target }; // Cast for simplicity
            this.updateCableVisualsForPort(source.modelId, source.portAttachName.replace('_Attach', '_Indicator'));


        } catch (error) {
            console.error("Error loading cable model:", error);
        }
    }

    disconnectCable(cableId: string): void {
        const cableInfo = this.cables[cableId];
        if (cableInfo) {
            this.scene.remove(cableInfo.object);
            // Dispose geometry/material if it's a custom cable mesh
            if (cableInfo.object instanceof THREE.Mesh || cableInfo.object instanceof THREE.Line) {
                cableInfo.object.geometry.dispose();
                if (Array.isArray(cableInfo.object.material)) {
                    cableInfo.object.material.forEach(m => m.dispose());
                } else {
                    cableInfo.object.material.dispose();
                }
            }
            delete this.cables[cableId];
        }
    }

    // Call this when a port's state changes
    updateCableVisualsForPort(modelInstanceId: string, portIndicatorName: string): void {
        Object.values(this.cables).forEach(cable => {
            if ((cable.source.modelId === modelInstanceId && cable.source.portAttachName.startsWith(portIndicatorName.replace('_Indicator', ''))) ||
                (cable.target.modelId === modelInstanceId && cable.target.portAttachName.startsWith(portIndicatorName.replace('_Indicator', '')))) {

                const modelData = this.loadedModels[modelInstanceId];
                const portInfo = modelData?.portIndicators[portIndicatorName];
                if (portInfo && cable.object instanceof THREE.Mesh) { // Assuming cable is a Mesh
                    const cableMaterial = cable.object.material as THREE.MeshStandardMaterial;
                    switch (portInfo.currentState) {
                        case 'active': cableMaterial.color.set(0x00aa00); break;
                        case 'inactive': cableMaterial.color.set(0x505050); break; // Or hide: cable.object.visible = false;
                        case 'error': cableMaterial.color.set(0xaa0000); break;
                        default: cableMaterial.color.set(0x505050);
                    }
                }
            }
        });
    }


    private onWindowResize(): void {
        const canvas = this.renderer.domElement;
        this.camera.aspect = canvas.clientWidth / canvas.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    }

    private onCanvasClick(event: MouseEvent): void {
        const canvas = this.renderer.domElement;
        const rect = canvas.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / canvas.clientWidth) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / canvas.clientHeight) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.scene.children, true); // true for recursive

        if (intersects.length > 0) {
            let selectedObject = intersects[0].object;
            // Traverse up to find the named model root or port indicator
            let modelInstanceId: string | null = null;
            let portName: string | null = null;
            let objectType: 'port' | 'device' | null = null;

            let current: THREE.Object3D | null = selectedObject;
            while (current) {
                if (this.loadedModels[current.name]) { // Check if it's a model root
                    modelInstanceId = current.name;
                    objectType = 'device';
                    break;
                }
                if (current.name.endsWith('_Indicator')) { // Check if it's a port indicator
                    portName = current.name;
                    // Try to find its parent model ID
                    let parent = current.parent;
                    while (parent) {
                        if (this.loadedModels[parent.name]) {
                            modelInstanceId = parent.name;
                            break;
                        }
                        parent = parent.parent;
                    }
                    objectType = 'port';
                    break;
                }
                current = current.parent;
            }

            if (modelInstanceId && (objectType === 'device' || (portName && objectType === 'port'))) {
                this.ngZone.run(() => { // Run inside Angular zone to trigger UI updates
                    this.onObjectSelected.next({
                        modelId: modelInstanceId!,
                        objectName: portName || modelInstanceId!, // If device, objectName is modelId
                        objectType: objectType!
                    });
                });
            } else {
                console.log('Clicked on:', selectedObject.name || 'unnamed object', selectedObject);
            }
        }
    }

    updateScene(): void {
        // For animations or continuous updates
        this.updateBlinkingPorts();
        // Update cable positions if models can be dragged (more complex)
        Object.values(this.cables).forEach(cableInfo => {
            if (cableInfo.object instanceof THREE.Line) { // For simple line cables
                const sourceAttachPoint = this.loadedModels[cableInfo.source.modelId]?.portAttachPoints[cableInfo.source.portAttachName];
                const targetAttachPoint = this.loadedModels[cableInfo.target.modelId]?.portAttachPoints[cableInfo.target.portAttachName];
                if (sourceAttachPoint && targetAttachPoint) {
                    const points = [
                        sourceAttachPoint.getWorldPosition(new THREE.Vector3()),
                        targetAttachPoint.getWorldPosition(new THREE.Vector3())
                    ];
                    (cableInfo.object.geometry as THREE.BufferGeometry).setFromPoints(points);
                    cableInfo.object.geometry.attributes.position.needsUpdate = true;
                }
            } else if (cableInfo.object instanceof THREE.Mesh && cableInfo.object.geometry instanceof THREE.CylinderGeometry) { // For Cylinder cables
                const sourceModel = this.loadedModels[cableInfo.source.modelId];
                const targetModel = this.loadedModels[cableInfo.target.modelId];
                const sourceAttachPoint = sourceModel?.portAttachPoints[cableInfo.source.portAttachName];
                const targetAttachPoint = targetModel?.portAttachPoints[cableInfo.target.portAttachName];

                if (sourceAttachPoint && targetAttachPoint) {
                    const sourcePos = sourceAttachPoint.getWorldPosition(new THREE.Vector3());
                    const targetPos = targetAttachPoint.getWorldPosition(new THREE.Vector3());
                    const direction = new THREE.Vector3().subVectors(targetPos, sourcePos);
                    const length = direction.length();

                    // Update cylinder height
                    // This requires recreating geometry or using a more flexible approach
                    // A simpler way is to scale, but CylinderGeometry height is fixed at creation.
                    // For dynamic length, scaling a unit cylinder is better:
                    // cableInfo.object.scale.y = length; // If cylinder is oriented along Y
                    // Or, if your cable model is designed for this, adjust its scale.

                    // Recalculate position and orientation
                    cableInfo.object.position.copy(sourcePos).add(new THREE.Vector3().copy(direction).multiplyScalar(0.5));
                    cableInfo.object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());

                    // If you're dynamically changing cylinder length, you need to manage that instance.
                    // A common way: scale a unit cylinder.
                    // If the cylinder was created with height 1:
                    // cableInfo.object.scale.y = length;
                    // This assumes the cylinder's local Y axis is its length axis.
                    // If your cable is a GLB, you'd scale the appropriate axis.
                }
            }
        });
    }

    render(): void {
        if (this.renderer && this.scene && this.camera) {
            this.controls.update(); // only if damping enabled
            this.renderer.render(this.scene, this.camera);
        }
    }

    dispose(): void {
        window.removeEventListener('resize', this.onWindowResize);
        if (this.renderer) {
            this.renderer.domElement.removeEventListener('click', this.onCanvasClick);
            this.renderer.dispose();
        }
        // Dispose all scene objects, geometries, materials
        this.scene.traverse(object => {
            if (object instanceof THREE.Mesh) {
                if (object.geometry) object.geometry.dispose();
                if (object.material) {
                    if (Array.isArray(object.material)) {
                        object.material.forEach(material => material.dispose());
                    } else {
                        object.material.dispose();
                    }
                }
            }
        });
        this.loadedModels = {};
        this.cables = {};
        console.log("ThreeSceneService disposed.");
    }
}