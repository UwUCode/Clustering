import { ServiceDefaultEvents } from "./ServiceManager";
import IPC, { ClusterMessageRoute } from "../IPC";
import { ShutdownCallback } from "../Master";
export interface ServiceInitalizer {
    ipc: IPC<ServiceDefaultEvents>;
    name: string;
}
export declare type ServiceBaseWithSignature = ServiceBase & (new (d: ServiceInitalizer) => ServiceBase);
export default abstract class ServiceBase {
    ipc: IPC<ServiceDefaultEvents>;
    name: string;
    protected processedCommands: number;
    constructor({ ipc, name }: ServiceInitalizer);
    get [Symbol.toStringTag](): string;
    toString(): string;
    done(): void;
    abstract shutdown(cb: ShutdownCallback): void;
    abstract handleCommand(data: unknown, from: "master" | ClusterMessageRoute): Promise<unknown>;
}
