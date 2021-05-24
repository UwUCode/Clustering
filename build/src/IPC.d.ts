import { ServiceDefaultEvents } from "./service/ServiceManager";
import Cluster, { ClusterDefaultEvents } from "./cluster/Cluster";
import { EVAL_RESPONSE_CODES } from "./Constants";
import { Stats } from "./IPCMaster";
import ServiceBase from "./service/ServiceBase";
import { EventEmitter } from "tsee";
export interface ServiceMessageRoute {
    type: "service";
    name: string;
}
export interface ClusterMessageRoute {
    type: "cluster";
    id: number;
}
export declare type MessageRoute<R extends "service" | "cluster" | "master" | "all" = "all"> = R extends "service" ? ServiceMessageRoute : R extends "cluster" ? ClusterMessageRoute : R extends "master" ? "master" : R extends "all" ? "master" | ServiceMessageRoute | ClusterMessageRoute : never;
export interface ProcessMessage {
    op: string;
    data: unknown;
    messageId: string;
    from: MessageRoute;
    to: MessageRoute | null;
}
export declare type EvalResponse<R = unknown> = EvalResponseSuccess<R> | EvalResponseTimeout | EvalResponseUnknown;
export interface EvalResponseSuccess<R = unknown> {
    time: Record<"start" | "end" | "total", number>;
    result: {
        error: boolean;
        data: R;
    };
    code: typeof EVAL_RESPONSE_CODES["OK"];
}
export interface EvalResponseTimeout {
    time: null;
    result: null;
    code: typeof EVAL_RESPONSE_CODES["TIMEOUT"];
}
export interface EvalResponseUnknown {
    time: null;
    result: null;
    code: typeof EVAL_RESPONSE_CODES["UNKNOWN"];
}
export declare type Emitted<D = unknown, S extends "service" | "cluster" | "master" | "all" = "all"> = (data: D, messageId: string, from: MessageRoute<S>) => void;
export declare type ProcessMessageReference = string;
export default class IPC<E = ServiceDefaultEvents | ClusterDefaultEvents> extends EventEmitter<E & {
    "statsResponse": Emitted<Stats, "master">;
}> {
    static generateRandomId(): string;
    get generateRandomId(): typeof IPC.generateRandomId;
    protected cb: Map<string, Record<"reject" | "resolve", (...args: Array<unknown>) => void>>;
    constructor();
    /**
     * Send a message to a different process
     *
     * @param {string} op - The op code for the reciever
     * @param {unknown} data - The data to send
     * @param {(`cluster.${number}` | `service.${string}` | null)} [to="master"] - The service or cluster to send the message to. Master if empty or null.
     */
    sendMessage(op: string, data?: unknown, to?: `cluster.${number}` | `service.${string}` | "master"): ProcessMessageReference;
    serviceCommand<R = unknown>(service: string, data: unknown, responsive: true): Promise<R>;
    serviceCommand(service: string, data: unknown, responsive?: false): Promise<void>;
    protected messageHandler(message: string | ProcessMessage): void;
    getStats(): Promise<Stats>;
    evalAtCluster<T extends {
        [k: string]: string | number | boolean;
    } = never>(id: number, code: ((this: Cluster, args: T) => Promise<unknown>) | string, args?: T): Promise<EvalResponse<unknown>>;
    evalAtService<T extends {
        [k: string]: string | number | boolean;
    } = never, S extends ServiceBase = ServiceBase>(name: number, code: ((this: S, args: T) => Promise<unknown>) | string, args?: T): Promise<EvalResponse<unknown>>;
    broadcastClusterEval<R = unknown, T extends {
        [k: string]: string | number | boolean;
    } = Record<string, string | number | boolean>>(code: ((this: Cluster, args: T) => Promise<R>) | string, args?: T): Promise<(EvalResponse<R> & {
        clusterId: number;
    })[]>;
    broadcastServiceEval<R = unknown, T extends {
        [k: string]: string | number | boolean;
    } = Record<string, string | number | boolean>, S extends ServiceBase = ServiceBase>(code: ((this: S, args: T) => Promise<R>) | string, args?: T): Promise<(EvalResponse<R> & {
        serviceName: string;
    })[]>;
    broadcastEval<R = unknown, T extends {
        [k: string]: string | number | boolean;
    } = Record<string, string | number | boolean>, S extends ServiceBase = ServiceBase>(code: ((this: Cluster | S, args: T) => Promise<R>) | string, args?: T): Promise<{
        clusters: (EvalResponse<R> & {
            clusterId: number;
        })[];
        services: (EvalResponse<R> & {
            serviceName: string;
        })[];
    }>;
    parse<T extends {
        [k: string]: string | number | boolean;
    } = {}>(d: Function | string, args?: T): string;
    /**
     * Restart a singular cluster
     *
     * @param {number} id - The id of the cluster to restart
     * @param {boolean} [force=false] - If we should just kill the process instead of gracefully shutting down
     */
    restartCluster(id: number, force?: boolean): void;
    /**
     * Restart all clusters
     *
     * @param {boolean} [force=false] - If we should just kill the process instead of gracefully shutting down
     */
    restartAllClusters(force?: boolean): void;
    /**
     * Shutdown a singular cluster
     *
     * @param {number} id - The id of the cluster to shutdown
     * @param {boolean} [force=false] - If we should just kill the process instead of gracefully shutting down
     */
    shutdownCluster(id: number, force?: boolean): void;
    /**
     * start a cluster
     *
     * @param {number} id - The id of the cluster to start
     */
    startCluster(id: number): void;
    /**
     * Shutdown all clusters
     *
     * @param {boolean} [force=false] - If we should just kill the process instead of gracefully shutting down
     */
    shutdownAllClusters(force?: boolean): void;
    /**
     * Restart a singular service
     *
     * @param {string} name - The name of the service to restart
     * @param {boolean} [force=false] - If we should just kill the process instead of gracefully shutting down
     */
    restartService(name: string, force?: boolean): void;
    /**
     * Restart all services
     *
     * @param {boolean} [force=false] - If we should just kill the process instead of gracefully shutting down
     */
    restartAllServices(force?: boolean): void;
    /**
     * Shutdown a singular service
     *
     * @param {string} name - The name of the service to shutdown
     * @param {boolean} [force=false] - If we should just kill the process instead of gracefully shutting down
     */
    shutdownService(name: string, force?: boolean): void;
    /**
     * Shutdown all services
     *
     * @param {boolean} [force=false] - If we should just kill the process instead of gracefully shutting down
     */
    shutdownAllServices(force?: boolean): void;
    /**
     * Shutdown all clusters & services
     *
     * @param {boolean} [force=false] - If we should just kill the process instead of gracefully shutting down
     */
    totalShutdown(hard?: boolean): void;
}
