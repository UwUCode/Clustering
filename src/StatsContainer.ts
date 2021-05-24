import { ClusterStats, ServiceStats, ShardStats, Stats } from "./IPCMaster";

export default class StatsContainer implements Stats {
	#memory = process.memoryUsage();
	#clusters: Array<ClusterStats> = [];
	#services: Array<ServiceStats> = [];

	get memory() { return this.#memory; }
	get clusters() { return this.#clusters; }
	get services() { return this.#services; }
	get combinedMemory() {
		const m = JSON.parse(JSON.stringify(this.memory)) as NodeJS.MemoryUsage;
		const l = [
			...this.clusters.map(v => v.memory),
			...this.services.map(v => v.memory)
		];
		Object.keys(m).forEach(k => {
			l.forEach((_, v) => m[k as keyof NodeJS.MemoryUsage] += l[v][k as keyof NodeJS.MemoryUsage]);
		});

		return m;
	}
	get shards() { return this.clusters.reduce((a,b) => a.concat(...b.shards), [] as Array<ShardStats>); }
	get guilds() { return this.clusters.reduce((a, b) => a + b.guilds, 0); }
	get users() { return this.clusters.reduce((a, b) => a + b.users, 0); }
	get voiceConnections() { return this.clusters.reduce((a, b) => a + b.voiceConnections, 0); }
	get guildChannels() { return this.clusters.reduce((a, b) => a + b.guildChannels, 0); }
	get dmChannels() { return this.clusters.reduce((a, b) => a + b.dmChannels, 0); }
	get largeGuilds() { return this.clusters.reduce((a, b) => a + b.largeGuilds, 0); }

	updateMemory() { this.#memory = process.memoryUsage(); return this; }
	setCluster(id: number, data: ClusterStats) { this.#clusters[id] = data; return this; }
	setService(name: string, data: ServiceStats) { this.#services[this.#services.indexOf(this.#services.find(s => s.name === name)!) ?? this.#services.length - 1] = data; return this; }

	toJSON(): Stats {
		return {
			memory: this.#memory,
			combinedMemory: this.combinedMemory,
			clusters: this.clusters,
			shards: [], // done on other side
			services: this.services,
			guilds: this.guilds,
			users: this.users,
			voiceConnections: this.voiceConnections,
			guildChannels: this.guildChannels,
			dmChannels: this.dmChannels,
			largeGuilds: this.largeGuilds
		};
	}
}
