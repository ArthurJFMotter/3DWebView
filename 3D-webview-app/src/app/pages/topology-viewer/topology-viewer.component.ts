import { Component, ElementRef, OnInit, OnDestroy, ViewChild, NgZone } from '@angular/core';
import { ThreeSceneService } from '../../services/tree-scene.service'; // Make sure path is correct
import { TopologyStateService, ModelInstance } from '../../services/topology-state.service'; // Adjust path & import ModelInstance
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-topology-viewer',
  standalone: false,
  templateUrl: './topology-viewer.component.html',
  styleUrls: ['./topology-viewer.component.scss']
})
export class TopologyViewerComponent implements OnInit, OnDestroy {
  @ViewChild('threeCanvas', { static: true }) private canvasRef!: ElementRef<HTMLCanvasElement>;
  private subscriptions: Subscription = new Subscription();

  constructor(
    private ngZone: NgZone,
    private threeSceneService: ThreeSceneService,
    private topologyStateService: TopologyStateService
  ) { }

  ngOnInit(): void {
    this.threeSceneService.initScene(this.canvasRef.nativeElement);
    this.startRenderingLoop();

    // Example: Load initial models from state
    this.subscriptions.add(
      this.topologyStateService.currentTopology$.subscribe(topology => { // CORRECTED
        // Clear existing models if necessary (or let ThreeSceneService handle updates smartly)
        // this.threeSceneService.clearScene();
        if (topology && topology.models) {
          // Before adding, you might want to clear existing models from ThreeSceneService
          // to prevent duplicates if this subscription re-fires with the same topology
          // (e.g., after a save operation that returns the same data).
          // This depends on how ThreeSceneService handles addModelToScene if model already exists.
          // For simplicity now, we'll assume ThreeSceneService addModelToScene handles duplicates or you manage clearing.

          topology.models.forEach(modelData => {
            this.threeSceneService.addModelToScene(
              modelData.assetUrl,
              modelData.id,
              modelData.position,
              modelData.rotation
            ).then(() => {
              if (modelData.ports) {
                modelData.ports.forEach(portData => {
                  this.threeSceneService.setPortState(
                    modelData.id,
                    portData.name,
                    portData.status,
                    portData.blinking
                  );
                });
              }
            });
          });
        }
        // TODO: Load cables based on topology.connections
        // if (topology && topology.connections) {
        //     topology.connections.forEach(conn => {
        //         this.threeSceneService.connectCable(
        //             conn.cableModelUrl || 'path/to/default/cable.glb', // Provide a default if undefined
        //             conn.id,
        //             conn.source,
        //             conn.target
        //         );
        //     });
        // }
      })
    );

    // Listen for model selection from ThreeSceneService (e.g., via raycast)
    this.subscriptions.add(
      this.threeSceneService.onObjectSelected.subscribe(selected => {
        if (selected) {
          console.log('Selected in 3D:', selected.modelId, selected.objectName, selected.objectType);
          this.topologyStateService.setSelectedObject(
            selected.modelId,
            selected.objectName,
            selected.objectType // CORRECTED
          );
        }
      })
    );
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
    this.threeSceneService.dispose();
  }

  addSwitch(): void {
    const modelDefinitionId = 'Switch_ModelA'; // Or get this from some UI selection
    this.topologyStateService.getModelDefinition(modelDefinitionId).subscribe(def => {
      if (def && def.assetUrl) { // Make sure assetUrl is present
        const newModelId = `switch_instance_${Date.now()}`;
        const newSwitch: ModelInstance = {
          id: newModelId,
          modelDefinitionId: modelDefinitionId,
          assetUrl: def.assetUrl,
          displayName: 'New Switch ' + newModelId.substring(newModelId.length - 5),
          position: { x: Math.random() * 6 - 3, y: 0, z: Math.random() * 6 - 3 },
          rotation: { x: 0, y: 0, z: 0 },
          ports: def.ports || [] // Use default ports from definition or an empty array
        };
        this.topologyStateService.addModelInstance(newSwitch); // CORRECTED
      } else {
        console.error(`Could not find model definition or assetUrl for ${modelDefinitionId}`);
      }
    });
  }

  deleteSelectedModel(): void {
    const selected = this.topologyStateService.getSelectedObjectValue();
    if (selected && selected.modelId) {
      // It's generally safer to remove by modelId regardless of whether a port or device was clicked,
      // assuming the intent is to remove the whole device.
      this.topologyStateService.removeModelInstance(selected.modelId); // CORRECTED
    }
  }
}