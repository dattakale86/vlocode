import Timer from 'lib/util/timer';
import { Iterable } from 'lib/util/iterable';
import { DatapackRecordDependency, DependencyResolver } from './datapackDeployService';

export enum DeploymentStatus {
    Pending,
    InProgress,
    Deployed,
    Failed
}

export default class DatapackDeploymentRecord {

    private readonly _dependencies = new Map<string, DatapackRecordDependency>();
    private readonly _deployTimer: Timer = new Timer();
    private _status: DeploymentStatus = DeploymentStatus.Pending;
    private _statusDetail?: string;
    private _existingId?: string;

    public get status(): DeploymentStatus {
        return this._status;
    }

    public get isDeployed(): boolean {
        return this._status === DeploymentStatus.Deployed;
    }

    public get isPending(): boolean {
        return this._status === DeploymentStatus.Pending || this._status === DeploymentStatus.InProgress;
    }

    public get isFailed(): boolean {
        return this._status === DeploymentStatus.Failed;
    }

    public get recordId(): string | undefined {
        return this._status === DeploymentStatus.Deployed ? this._statusDetail : this._existingId;
    }

    public get statusMessage(): string | undefined {
        return this._status !== DeploymentStatus.Deployed ? this._statusDetail : undefined;
    }

    public get deployTime(): number {
        return this._deployTimer.elapsed;
    }

    public get hasUnresolvedDependencies(): boolean {
        return this._dependencies.size > 0;
    }

    constructor(
        public readonly datapackType: string,
        public readonly sobjectType: string,
        public readonly sourceKey: string,
        public readonly datapackKey: string,
        public readonly values: Object = {}) {
    }

    public updateStatus(status: DeploymentStatus, detail?: string) {
        if (status === DeploymentStatus.InProgress) {
            this._deployTimer.reset();
        } else if (status === DeploymentStatus.Failed || status === DeploymentStatus.Deployed) {
            this._deployTimer.stop();
        }
        this._status = status;
        this._statusDetail = detail;
    }

    public setExistingId(value: string) {
        this._existingId = value;
    }

    public setField(field: string, value: any) {
        this.values[field] = value;
    }

    public addLookup(field: string, dependency: DatapackRecordDependency) {
        this._dependencies.set(field, dependency);
    }

    public getDependencySourceKeys() {
        return Iterable.map(this._dependencies.values(), d => d.VlocityMatchingRecordSourceKey ?? d.VlocityLookupRecordSourceKey);
    }

    public getDependencies() {
        return [...this._dependencies.values()];
    }

    public async resolveDependencies(resolver: DependencyResolver) {
        const depArray = [...this._dependencies.entries()];
        for(const [field, dependency] of depArray) {
            const resolution = await resolver.resolveDependency(dependency);
            if (resolution) {
                this.values[field] = resolution;
                this._dependencies.delete(field);
            }
        }
    }
}
