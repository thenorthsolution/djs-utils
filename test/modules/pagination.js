// @ts-check
import { ButtonPaginationBuilder, PaginationControllerType, SendAs } from '@thenorthsolution/djs-pagination';
import { ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { SlashCommandBuilder } from "reciple";

export class Pagination {
    /**
     * @type {import("reciple").AnyCommandResolvable[]}
     */
    commands = [
        new SlashCommandBuilder()
            .setName('pagination')
            .setDescription('Creates a pagination')
            .setExecute(async ({ interaction }) => {
                const pagination = new ButtonPaginationBuilder();

                pagination
                    .setButtons(
                        { button: new ButtonBuilder().setCustomId('prev').setLabel('Previous').setStyle(ButtonStyle.Secondary), type: PaginationControllerType.PreviousPage },
                        { button: new ButtonBuilder().setCustomId('stop').setLabel('Stop').setStyle(ButtonStyle.Danger), type: PaginationControllerType.Stop },
                        { button: new ButtonBuilder().setCustomId('next').setLabel('Next').setStyle(ButtonStyle.Secondary), type: PaginationControllerType.NextPage },
                    )
                    .setPages(
                        { content: 'Content', embeds: [{ title: 'Embed' }] },
                        'Just Content',
                        new EmbedBuilder().setTitle('Just Embed'),
                        () => `Dynamic ${new Date().toISOString()}`
                    )

                await pagination.send({
                    command: interaction,
                    sendAs: SendAs.ReplyMessage
                })
            })
    ];

    onStart() {
        return true;
    }
}

export default new Pagination();