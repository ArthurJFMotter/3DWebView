import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { map, catchError, tap, first } from 'rxjs/operators';
import { HttpClient } from '@angular/common/http'; // For backend interaction

// --- Interfaces to define the shape of your topology data ---
// (These should match what your backend expects/provides and what ThreeSceneService uses)

export interface Vector3D {
    x: number;
    y: number;
    z: number;
}

export interface EulerRotation {
    x: number;
    y: number;
    z: number;
    order?: string; // e.g., 'XYZ'
}

export interface PortState {
    name: string; // e.g., 'Switch_ModelA_Port01_Indicator' (matches Blender name)
    status: 'active' | 'inactive' | 'error' | string; // string for custom hex colors
    blinking: boolean;
    connectedCableId?: string; // Optional: ID of the cable connected to this port
    // ... other port-specific data
}

export interface ModelInstance {
    id: string; // Unique instance ID in the topology (e.g., "switch-floor1-rack2-u5")
    modelDefinitionId: string; // Reference to a model type (e.g., "Switch_ModelA")
    assetUrl: string; // URL to the .glb file (e.g., 'assets/models/Switch_ModelA.glb')
    displayName?: string;
    position: Vector3D;
    rotation: EulerRotation;
    ports: PortState[];
    // ... other model-specific data
}

export interface CableConnection {
    id: string; // Unique cable instance ID
    cableModelUrl?: string; // Optional: URL if using a specific GLB for the cable
    source: {
        modelId: string;
        portAttachName: string; // e.g., 'Switch_ModelA_Port01_Attach'
    };
    target: {
        modelId: string;
        portAttachName: string; // e.g., 'Router_ModelB_Port03_Attach'
    };
    // ... other cable-specific data (e.g., type, color override)
}

export interface TopologyLayout {
    id: string; // ID of this specific layout (e.g., "main-data-center")
    name: string;
    models: ModelInstance[];
    connections: CableConnection[];
    // ... other layout-specific metadata
}

interface SelectedObjectInfo {
    modelId: string;
    objectName: string; // Could be a port name or the modelId itself
    objectType: 'port' | 'device';
}


@Injectable({
    providedIn: 'root'
})
export class TopologyStateService {
    // Backend API endpoint (replace with your actual API URL)
    private apiUrl = '/api/topology'; // Example API base URL

    // BehaviorSubjects to hold and broadcast the current state
    // Initialize with a default empty or placeholder state
    private readonly _currentTopology = new BehaviorSubject<TopologyLayout | null>(null);
    private readonly _selectedObject = new BehaviorSubject<SelectedObjectInfo | null>(null);
    private readonly _isLoading = new BehaviorSubject<boolean>(false);

    // Expose observables for components to subscribe to
    readonly currentTopology$: Observable<TopologyLayout | null> = this._currentTopology.asObservable();
    readonly selectedObject$: Observable<SelectedObjectInfo | null> = this._selectedObject.asObservable();
    readonly isLoading$: Observable<boolean> = this._isLoading.asObservable();

    constructor(private http: HttpClient) {
        // Optionally, load an initial topology when the service is created
        // this.loadTopology('default-layout-id');
    }

    // --- Public API for the Service ---

    /**
     * Loads a topology layout from the backend or a default.
     * @param layoutId The ID of the topology layout to load.
     */
    loadTopology(layoutId: string): void {
        this._isLoading.next(true);
        this.http.get<TopologyLayout>(`${this.apiUrl}/layouts/${layoutId}`)
            .pipe(
                tap(topology => {
                    this._currentTopology.next(topology);
                    console.log('Topology loaded:', topology);
                }),
                catchError(error => {
                    console.error('Error loading topology:', error);
                    this._currentTopology.next(this.getFallbackTopology()); // Provide a fallback or empty state
                    return of(null); // Or re-throw, or handle more gracefully
                }),
                tap(() => this._isLoading.next(false))
            ).subscribe();
    }

    /**
     * Saves the current topology state to the backend.
     */
    saveCurrentTopology(): void {
        const currentTopology = this._currentTopology.getValue();
        if (!currentTopology) {
            console.warn('No topology data to save.');
            return;
        }
        this._isLoading.next(true);
        // Assuming PUT to update an existing layout, or POST if it's new
        this.http.put<TopologyLayout>(`${this.apiUrl}/layouts/${currentTopology.id}`, currentTopology)
            .pipe(
                tap(savedTopology => {
                    this._currentTopology.next(savedTopology); // Update with response from backend (e.g., if it adds timestamps)
                    console.log('Topology saved:', savedTopology);
                }),
                catchError(error => {
                    console.error('Error saving topology:', error);
                    // Potentially revert to previous state or notify user
                    return of(null);
                }),
                tap(() => this._isLoading.next(false))
            ).subscribe();
    }

    /**
     * Adds a new model instance to the current topology.
     * This is a local update; call saveCurrentTopology() to persist.
     */
    addModelInstance(model: ModelInstance): void {
        const currentTopology = this._currentTopology.getValue();
        if (currentTopology) {
            const updatedModels = [...currentTopology.models, model];
            this._currentTopology.next({ ...currentTopology, models: updatedModels });
            // Optionally, auto-save or provide a "dirty" flag
        } else {
            // Handle case where no topology is loaded yet - perhaps initialize one
            console.warn('Cannot add model: No topology loaded.');
            // Or initialize a new one: this._currentTopology.next({ id: 'new-layout', name: 'New Layout', models: [model], connections: [] });
        }
    }

    /**
     * Removes a model instance from the current topology.
     * This is a local update; call saveCurrentTopology() to persist.
     */
    removeModelInstance(modelId: string): void {
        const currentTopology = this._currentTopology.getValue();
        if (currentTopology) {
            const updatedModels = currentTopology.models.filter(m => m.id !== modelId);
            // Also remove any connections associated with this model
            const updatedConnections = currentTopology.connections.filter(
                conn => conn.source.modelId !== modelId && conn.target.modelId !== modelId
            );
            this._currentTopology.next({ ...currentTopology, models: updatedModels, connections: updatedConnections });
            if (this._selectedObject.getValue()?.modelId === modelId) {
                this.clearSelectedObject();
            }
        }
    }

    /**
     * Updates the state of a specific port on a model.
     * This is a local update; call saveCurrentTopology() to persist.
     */
    updatePortState(modelId: string, portName: string, newStatus: PortState['status'], newBlinking: boolean): void {
        const currentTopology = this._currentTopology.getValue();
        if (currentTopology) {
            const modelIndex = currentTopology.models.findIndex(m => m.id === modelId);
            if (modelIndex > -1) {
                const portIndex = currentTopology.models[modelIndex].ports.findIndex(p => p.name === portName);
                if (portIndex > -1) {
                    const updatedTopology = { ...currentTopology };
                    updatedTopology.models = [...updatedTopology.models]; // New array for models
                    updatedTopology.models[modelIndex] = { ...updatedTopology.models[modelIndex] }; // New model object
                    updatedTopology.models[modelIndex].ports = [...updatedTopology.models[modelIndex].ports]; // New ports array
                    updatedTopology.models[modelIndex].ports[portIndex] = { // New port object
                        ...updatedTopology.models[modelIndex].ports[portIndex],
                        status: newStatus,
                        blinking: newBlinking
                    };
                    this._currentTopology.next(updatedTopology);
                }
            }
        }
    }

    /**
     * Adds a cable connection to the topology.
     * This is a local update; call saveCurrentTopology() to persist.
     */
    addCableConnection(connection: CableConnection): void {
        const currentTopology = this._currentTopology.getValue();
        if (currentTopology) {
            // Ensure cable ID is unique if not provided
            if (!connection.id) {
                connection.id = `cable_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            }
            const updatedConnections = [...currentTopology.connections, connection];
            this._currentTopology.next({ ...currentTopology, connections: updatedConnections });
        }
    }

    /**
     * Removes a cable connection from the topology.
     * This is a local update; call saveCurrentTopology() to persist.
     */
    removeCableConnection(cableId: string): void {
        const currentTopology = this._currentTopology.getValue();
        if (currentTopology) {
            const updatedConnections = currentTopology.connections.filter(c => c.id !== cableId);
            this._currentTopology.next({ ...currentTopology, connections: updatedConnections });
        }
    }


    // --- Selected Object Management ---
    setSelectedObject(modelId: string, objectName: string, objectType: 'port' | 'device'): void {
        this._selectedObject.next({ modelId, objectName, objectType });
    }

    clearSelectedObject(): void {
        this._selectedObject.next(null);
    }

    getSelectedObjectValue(): SelectedObjectInfo | null {
        return this._selectedObject.getValue();
    }

    // --- Utility / Getter ---
    getCurrentTopologyValue(): TopologyLayout | null {
        return this._currentTopology.getValue();
    }

    // Provides a default empty or placeholder topology if loading fails
    private getFallbackTopology(): TopologyLayout {
        return {
            id: 'fallback-layout',
            name: 'Fallback Topology (Error Loading)',
            models: [],
            connections: []
        };
    }

    /**
     * Retrieves a specific model definition (e.g., its GLB URL, default ports)
     * This might fetch from another endpoint or a local config.
     */
    getModelDefinition(modelDefinitionId: string): Observable<Partial<ModelInstance> | null> {
        // Example: Fetch from a definitions endpoint
        // return this.http.get<ModelInstance>(`/api/models/definitions/${modelDefinitionId}`);
        // Or from a local map if definitions are static
        const definitions: { [key: string]: Partial<ModelInstance> } = {
            'Switch_ModelA': { assetUrl: 'assets/models/Switch_ModelA.glb', ports: [/* default ports */] },
            'Router_ModelB': { assetUrl: 'assets/models/Router_ModelB.glb', ports: [/* default ports */] },
        };
        return of(definitions[modelDefinitionId] || null);
    }
}