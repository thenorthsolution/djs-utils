// @ts-check

import { ButtonPaginationBuilder } from "@falloutstudios/djs-pagination";
import { ButtonStyle, ComponentType, EmbedBuilder } from "discord.js";
import { CommandType } from "reciple";

/**
 * @type {import("@falloutstudios/djs-pagination").PageResolvable[]}
 */
export const pages = ['Page1', new EmbedBuilder().setTitle('Page2').setColor('Random'), { content: 'Page3', embeds: [{ title: 'This is page 3' }] }];

/**
 * @type {import("reciple").RecipleModuleScript}
 */
export default {
    versions: ['^7'],
    commands: [
        {
            commandType: CommandType.SlashCommand,
            name: 'pagination',
            description: 'Button pagination testing',
            async execute({ interaction }) {
                const pagination = new ButtonPaginationBuilder({
                    pages,
                    endTimer: 20000,
                    onEnd: 'DisableComponents',
                    ephemeral: true,
                    buttons: [
                        {
                            button: { type: ComponentType.Button, label: 'First', customId: 'first', style: ButtonStyle.Secondary },
                            type: 'FirstPage'
                        },
                        {
                            button: { type: ComponentType.Button, label: 'Prev', customId: 'prev', style: ButtonStyle.Primary },
                            type: 'PreviousPage'
                        },
                        {
                            button: { type: ComponentType.Button, label: 'Stop', customId: 'stop', style: ButtonStyle.Danger },
                            type: 'Stop'
                        },
                        {
                            button: { type: ComponentType.Button, label: 'Next', customId: 'next', style: ButtonStyle.Primary },
                            type: 'NextPage'
                        },
                        {
                            button: { type: ComponentType.Button, label: 'Last', customId: 'last', style: ButtonStyle.Secondary },
                            type: 'LastPage'
                        }
                    ]
                });

                await interaction.deferReply({ ephemeral: true });

                await pagination.send({
                    command: interaction,
                    sendAs: 'EditMessage'
                });
            }
        }
    ],
    async onStart(client) {
        return true;
    }
}