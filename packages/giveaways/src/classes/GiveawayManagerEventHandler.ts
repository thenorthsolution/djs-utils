import { Channel, Collection, Guild, Interaction, Message, PartialMessage, inlineCode } from 'discord.js';
import { GiveawayManager } from './GiveawayManager';

export class GiveawayManagerEventHandler {
    constructor(readonly manager: GiveawayManager) {
        this.guildDelete = this.guildDelete.bind(this);
        this.channelDelete = this.channelDelete.bind(this);
        this.messageDelete = this.messageDelete.bind(this);
        this.messageDeleteBulk = this.messageDeleteBulk.bind(this);
        this.interactionCreate = this.interactionCreate.bind(this);
    }

    async guildDelete(guild: Guild) {
        const giveaways = await this.manager.database.fetchGiveaways({ filter: { guildId: guild.id } });

        for (const giveaway of giveaways) {
            await this.manager.deleteGiveaway(giveaway.id);
        }
    }

    async channelDelete(channel: Channel) {
        if (channel.isDMBased() || !channel.isTextBased()) return;

        const giveaways = await this.manager.database.fetchGiveaways({ filter: { channelId: channel.id } });

        for (const giveaway of giveaways) {
            await this.manager.deleteGiveaway(giveaway.id);
        }
    }

    async messageDelete(message: Message|PartialMessage) {
        if (!message.inGuild()) return;

        const giveaway = (await this.manager.database.fetchGiveaways({ filter: { messageId: message.id } }))[0];
        if (!giveaway) return;

        await this.manager.deleteGiveaway(giveaway.id);
    }

    async messageDeleteBulk(messages: Collection<string, Message|PartialMessage>) {
        if (!messages.first()?.inGuild()) return;

        const giveaways = (await Promise.all(messages.map(async message => (await (this.manager.database.fetchGiveaways({ filter: { messageId: message.id } })))[0]))).filter(Boolean);

        for (const giveaway of giveaways) {
            await this.manager.deleteGiveaway(giveaway.id);
        }
    }

    async interactionCreate(interaction: Interaction) {
        if (!interaction.isButton() || interaction.customId !== this.manager.joinButton.customId) return;

        const deffered = interaction.replied || interaction.deferred || await interaction.deferReply({ ephemeral: true }).catch(err => this.manager.emit('error', err));
        if (!deffered) return;

        try {
            const allowed = this.manager.onBeforeHandleInteraction ? await Promise.resolve(this.manager.onBeforeHandleInteraction(interaction)) : true;
            if (allowed === false) return;

            const message = interaction.message;
            const giveaway = (await this.manager.database.fetchGiveaways({ filter: { messageId: message.id } }))[0];

            if (!giveaway) {
                await interaction.editReply(`${inlineCode('❌')} Unable to find giveaway from this message`);
                return;
            }

            const entry = await this.manager.toggleUserEntry(giveaway.id, interaction.user.id).catch(err => { this.manager.emit('error', err); });
            if (entry === undefined) {
                await interaction.editReply(`${inlineCode('❌')} Unable to add/remove entry`);
                return;
            }

            if (entry) {
                await interaction.editReply(`${inlineCode('🎉')} Successfully added new entry!`);
            } else {
                await interaction.editReply(`${inlineCode('🎉')} Successfully removed current entry!`);
            }
        } catch (err) {
            this.manager.emit('error', err);
        }
    }
}