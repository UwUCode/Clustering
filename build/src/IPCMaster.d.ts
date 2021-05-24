/// <reference types="node" />
import IPC, { ProcessMessage, ProcessMessageReference } from "./IPC";
import Master from "./Master";
import { DefaultEventMap } from "tsee";
import Eris from "eris";
export interface Stats {
    memory: NodeJS.MemoryUsage;
    combinedMemory: NodeJS.MemoryUsage;
    clusters: Array<ClusterStats>;
    shards: Array<ShardStats>;
    services: Array<ServiceStats>;
}
export interface ClusterStats {
    id: number;
    memory: NodeJS.MemoryUsage;
    uptime: number;
    shards: Array<ShardStats>;
    guilds: number;
    users: number;
    voiceConnections: number;
    guildChannels: number;
    dmChannels: number;
    largeGuilds: number;
}
export interface ShardStats {
    id: number;
    clusterId: number;
    latency: number;
    status: Eris.Shard["status"];
    guilds: number;
    largeGuilds: number;
}
export interface ServiceStats {
    name: string;
    memory: NodeJS.MemoryUsage;
    uptime: number;
    processedCommands: number;
}
export default class IPCMaster<E extends DefaultEventMap = DefaultEventMap> extends IPC<E> {
    master: Master;
    active: boolean;
    constructor(master: Master);
    /**
     * Send a message to a different process
     *
     * @param {string} op - The op code for the reciever
     * @param {unknown} data - The data to send
     * @param {(`cluster.${number}` | `service.${string}`)} to - The service or cluster to send the message to.
     */
    sendMessage(op: string, data: unknown, to: `cluster.${number}` | `service.${string}`): ProcessMessageReference;
    messageHandler(message: string | ProcessMessage): void;
    /**
     * Restart a singular cluster
     *
     * @param {number} id - The id of the cluster to restart
     * @param {boolean} [force=false] - If we should just kill the process instead of gracefully restarting
     */
    restartCluster(id: number, force?: boolean): void;
    /**
     * Restart all clusters
     *
     * @param {boolean} [force=false] - If we should just kill the processes instead of gracefully restarting
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
     * @param {boolean} [force=false] - If we should just kill the processes instead of gracefully shutting down
     */
    shutdownAllClusters(force?: boolean): void;
    /**
     * Restart a singular service
     *
     * @param {string} name - The name of the service to restart
     * @param {boolean} [force=false] - If we should just kill the process instead of gracefully restarting
     */
    restartService(name: string, force?: boolean): void;
    /**
     * Restart all services
     *
     * @param {boolean} [force=false] - If we should just kill the processes instead of gracefully restarting
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
     * @param {boolean} [force=false] - If we should just kill the processes instead of gracefully shutting down
     */
    shutdownAllServices(force?: boolean): void;
    /**
     * Shutdown all clusters & services
     *
     * @param {boolean} [force=false] - If we should just kill the process instead of gracefully shutting down
     */
    totalShutdown(force?: boolean): true | undefined;
}
