import { Component, ElementRef, OnInit, OnDestroy, ViewChild, NgZone } from '@angular/core';
import { ThreeSceneService } from '../../services/tree-scene.service';
import { TopologyStateService, ModelInstance, PortState } from '../../services/topology-state.service';
import { Subscription } from 'rxjs';
import * as THREE from 'three';

@Component({
  selector: 'app-topology-viewer-mock',
  standalone: false,
  templateUrl: './topology-viewer-mock.component.html',
  styleUrls: ['./topology-viewer-mock.component.scss']
})
export class TopologyViewerMockComponent implements OnInit, OnDestroy {
  @ViewChild('threeCanvas', { static: true }) private canvasRef!: ElementRef<HTMLCanvasElement>;
  private subscriptions: Subscription = new Subscription();

  constructor(
    private ngZone: NgZone,
    private threeSceneService: ThreeSceneService,
    private topologyStateService: TopologyStateService // Keep for selectedObject if needed
  ) { }

  ngOnInit(): void {
    this.threeSceneService.initScene(this.canvasRef.nativeElement);
    this.startRenderingLoop();

    // --- MOCK LOADING - START ---
    this.loadMockModel();
    // --- MOCK LOADING - END ---

    // Keep this part if you want to test selection with your mock model
    this.subscriptions.add(
      this.threeSceneService.onObjectSelected.subscribe(selected => {
        if (selected) {
          console.log('Selected in 3D:', selected.modelId, selected.objectName, selected.objectType);
          this.topologyStateService.setSelectedObject(
            selected.modelId,
            selected.objectName,
            selected.objectType
          );
        }
      })
    );

    // Comment out or remove the TopologyStateService loading for now
    /*
    this.subscriptions.add(
        this.topologyStateService.currentTopology$.subscribe(topology => {
            if (topology && topology.models) {
                topology.models.forEach(modelData => {
                    // ... (original loading logic)
                });
            }
        })
    );
    */
  }

  loadMockModel(): void {
    const modelUrl = 'assets/models/test-router.glb'; // Path relative to the 'src/assets/' folder
    const modelInstanceId = 'mock-router-01';
    const position = { x: 0, y: 0, z: 0 }; // Using your Vector3D interface
    const rotation = { x: 0, y: Math.PI / 2, z: 0 }; // Using your EulerRotation interface, example rotation

    console.log(`Attempting to load mock model from: ${modelUrl}`);

    this.threeSceneService.addModelToScene(
      modelUrl,
      modelInstanceId,
      position,
      rotation
    ).then(() => {
      console.log(`Mock model ${modelInstanceId} should be loaded.`);
      // Optionally, set some mock port states if your model has named indicators
      // This assumes your test-router.glb has indicators named like 'Router_Port01_Indicator' etc.
      // You'll need to adjust these names based on your actual .glb file.
      const mockPortNames = [
        // Replace with actual indicator names from your Blender model if you know them
        'TestRouter_Port01_Indicator',
        'TestRouter_Port02_Indicator',
        'TestRouter_Port03_Indicator',
        'TestRouter_Port04_Indicator'
      ];

      mockPortNames.forEach((portName, index) => {
        this.threeSceneService.setPortState(
          modelInstanceId,
          portName,
          index % 2 === 0 ? 'active' : 'inactive', // Alternate active/inactive
          index % 2 === 0 // Blink if active
        );
      });

    }).catch(error => {
      console.error("Error loading mock model:", error);
    });
  }

  startRenderingLoop(): void {
    this.ngZone.runOutsideAngular(() => {
      const animate = () => {
        requestAnimationFrame(animate);
        this.threeSceneService.updateScene();
        this.threeSceneService.render();
      };
      animate();
    });
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    // Optionally remove the mock model if you want a clean slate on re-init
    // this.threeSceneService.removeModelFromScene('mock-router-01');
    this.threeSceneService.dispose();
  }

  // You can keep addSwitch and deleteSelectedModel, but they might not
  // interact with the mock model unless you adapt TopologyStateService for it.
  // For this test, we are bypassing TopologyStateService for model loading.
  addSwitch(): void {
    // ... (this will use TopologyStateService, not the mock)
    console.warn("addSwitch uses TopologyStateService, not the current mock setup.");
  }

  deleteSelectedModel(): void {
    // ... (this will use TopologyStateService, not the mock)
    console.warn("deleteSelectedModel uses TopologyStateService, not the current mock setup.");
  }
}