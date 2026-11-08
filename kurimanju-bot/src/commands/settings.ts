import {
  ChannelType,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type APIApplicationCommandOptionChoice,
} from 'discord.js';
import type { Command } from '../types/command';
import { hasManageGuild } from '../services/permissions';
import {
  buildSettingsEmbed,
  setFeatureChannel,
  setFeatureEnabled,
  buildWelcomePreview,
  setWelcomeBackground,
  setDailyNotice,
  setWelcomeMessage,
  toggleEmojiExcludedChannel,
} from '../services/settingsService';
import {
  CHANNEL_FEATURE_KEYS,
  FEATURE_KEYS,
  FEATURES,
  isChannelFeatureKey,
  isBackgroundStyle,
  isFeatureKey,
  MAX_DAILY_NOTICE_LENGTH,
  MAX_WELCOME_MESSAGE_LENGTH,
  type FeatureKey,
} from '../services/settingsSchema';

function toChoice(key: FeatureKey): APIApplicationCommandOptionChoice<string> {
  return { name: FEATURES[key].en, name_localizations: { ko: FEATURES[key].ko }, value: key };
}

const settings: Command = {
  data: new SlashCommandBuilder()
    .setName('settings')
    .setNameLocalizations({ ko: '설정' })
    .setDescription('Configure Kurimanju for this server')
    .setDescriptionLocalizations({ ko: '이 서버의 쿠리만쥬 설정' })
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) =>
      sub
        .setName('view')
        .setNameLocalizations({ ko: '보기' })
        .setDescription('Show current settings')
        .setDescriptionLocalizations({ ko: '현재 설정 보기' }),
    )
    .addSubcommand((sub) =>
      sub
        .setName('feature')
        .setNameLocalizations({ ko: '기능' })
        .setDescription('Turn a feature on or off')
        .setDescriptionLocalizations({ ko: '기능 켜기/끄기' })
        .addStringOption((opt) =>
          opt
            .setName('feature')
            .setNameLocalizations({ ko: '기능' })
            .setDescription('Feature')
            .setDescriptionLocalizations({ ko: '설정할 기능' })
            .setRequired(true)
            .addChoices(...FEATURE_KEYS.map(toChoice)),
        )
        .addBooleanOption((opt) =>
          opt
            .setName('enabled')
            .setNameLocalizations({ ko: '켜기' })
            .setDescription('True = on, False = off')
            .setDescriptionLocalizations({ ko: 'True = 켜기, False = 끄기' })
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('channel')
        .setNameLocalizations({ ko: '채널' })
        .setDescription('Set the channel for a feature (leave empty to clear)')
        .setDescriptionLocalizations({ ko: '기능을 사용할 채널 지정 (비우면 해제)' })
        .addStringOption((opt) =>
          opt
            .setName('feature')
            .setNameLocalizations({ ko: '기능' })
            .setDescription('Feature')
            .setDescriptionLocalizations({ ko: '채널을 지정할 기능' })
            .setRequired(true)
            .addChoices(...CHANNEL_FEATURE_KEYS.map(toChoice)),
        )
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setNameLocalizations({ ko: '채널' })
            .setDescription('Text channel (leave empty to clear)')
            .setDescriptionLocalizations({ ko: '텍스트 채널 (비우면 해제)' })
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('emoji-exclude')
        .setNameLocalizations({ ko: '이모지제외' })
        .setDescription('Toggle a channel where emoji enlarge is disabled')
        .setDescriptionLocalizations({ ko: '이모지 확대를 하지 않을 채널 추가/해제 (다시 실행하면 해제)' })
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setNameLocalizations({ ko: '채널' })
            .setDescription('Channel (threads inside are excluded too)')
            .setDescriptionLocalizations({ ko: '채널 (안의 스레드도 함께 제외)' })
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('welcome-message')
        .setNameLocalizations({ ko: '환영문구' })
        .setDescription('Set the welcome message (leave empty for default)')
        .setDescriptionLocalizations({ ko: '환영 문구 설정 (비우면 기본값) {user} {name} {server} {count}' })
        .addStringOption((opt) =>
          opt
            .setName('message')
            .setNameLocalizations({ ko: '문구' })
            .setDescription('{user} mention, {name}, {server}, {count}')
            .setDescriptionLocalizations({ ko: '{user} 멘션, {name} 이름, {server} 서버, {count} 멤버 수' })
            .setMaxLength(MAX_WELCOME_MESSAGE_LENGTH)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('welcome-background')
        .setNameLocalizations({ ko: '환영배경' })
        .setDescription('Set the welcome card background/style (both empty = remove)')
        .setDescriptionLocalizations({ ko: '환영 카드 배경 이미지·스타일 (둘 다 비우면 기본 디자인)' })
        .addAttachmentOption((opt) =>
          opt
            .setName('image')
            .setNameLocalizations({ ko: '이미지' })
            .setDescription('PNG/JPG/WEBP, up to 8MB (cropped to 1024x500)')
            .setDescriptionLocalizations({ ko: 'PNG/JPG/WEBP, 8MB 이하 (1024x500에 맞춰 잘림)' })
            .setRequired(false),
        )
        .addStringOption((opt) =>
          opt
            .setName('style')
            .setNameLocalizations({ ko: '스타일' })
            .setDescription('Photo = blurred & darkened, Illustration = sharp')
            .setDescriptionLocalizations({ ko: '사진 = 흐리게·어둡게, 일러스트 = 선명하게' })
            .setRequired(false)
            .addChoices(
              { name: 'Photo (blurred)', name_localizations: { ko: '사진 (흐리게)' }, value: 'photo' },
              { name: 'Illustration (sharp)', name_localizations: { ko: '일러스트 (선명하게)' }, value: 'illustration' },
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('daily-notice')
        .setNameLocalizations({ ko: '매일알림' })
        .setDescription('Set daily notice time/message (both empty = show current)')
        .setDescriptionLocalizations({ ko: '매일 알림 시각·문구 설정 (둘 다 비우면 현재 설정 보기)' })
        .addStringOption((opt) =>
          opt
            .setName('time')
            .setNameLocalizations({ ko: '시각' })
            .setDescription('24h KST, e.g. 21:45')
            .setDescriptionLocalizations({ ko: '한국 시간 24시간 형식, 예: 21:45' })
            .setMaxLength(5)
            .setRequired(false),
        )
        .addStringOption((opt) =>
          opt
            .setName('message')
            .setNameLocalizations({ ko: '문구' })
            .setDescription('\\n = line break, "기본" = default message')
            .setDescriptionLocalizations({ ko: '\\n 은 줄바꿈, "기본" 입력 시 기본 문구' })
            .setMaxLength(MAX_DAILY_NOTICE_LENGTH)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('welcome-preview')
        .setNameLocalizations({ ko: '환영미리보기' })
        .setDescription('Preview the welcome message with yourself')
        .setDescriptionLocalizations({ ko: '나를 기준으로 환영 메시지와 카드 미리보기' }),
    ),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: '서버에서만 사용할 수 있어요.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (!hasManageGuild(interaction)) {
      await interaction.reply({
        content: '🔒 **서버 관리** 권한이 있어야 사용할 수 있어요.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const sub = interaction.options.getSubcommand(true);

    if (sub === 'view') {
      await interaction.reply({
        embeds: [buildSettingsEmbed(interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'feature') {
      const feature = interaction.options.getString('feature', true);
      const enabled = interaction.options.getBoolean('enabled', true);
      if (!isFeatureKey(feature)) throw new Error(`알 수 없는 기능: ${feature}`);

      // Firestore 쓰기 + 권한 확인이 3초를 넘길 수 있어 먼저 defer
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await interaction.editReply(await setFeatureEnabled(interaction.guild, feature, enabled));
      return;
    }

    if (sub === 'channel') {
      const feature = interaction.options.getString('feature', true);
      const channel = interaction.options.getChannel('channel', false);
      if (!isChannelFeatureKey(feature)) throw new Error(`채널을 쓰지 않는 기능: ${feature}`);

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await interaction.editReply(
        await setFeatureChannel(interaction.guild, feature, channel?.id ?? null),
      );
      return;
    }

    if (sub === 'emoji-exclude') {
      const channel = interaction.options.getChannel('channel', true);
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await interaction.editReply(await toggleEmojiExcludedChannel(interaction.guild, channel.id));
      return;
    }

    if (sub === 'welcome-message') {
      const message = interaction.options.getString('message', false);
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await interaction.editReply(await setWelcomeMessage(interaction.guild, message));
      return;
    }

    if (sub === 'welcome-background') {
      const image = interaction.options.getAttachment('image', false);
      const styleValue = interaction.options.getString('style', false);
      const style = styleValue && isBackgroundStyle(styleValue) ? styleValue : null;
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await interaction.editReply(await setWelcomeBackground(interaction.guild, image, style));
      return;
    }

    if (sub === 'daily-notice') {
      const time = interaction.options.getString('time', false);
      const message = interaction.options.getString('message', false);
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      // 미리보기에 @everyone이 있어도 알림이 가지 않도록
      await interaction.editReply({
        content: await setDailyNotice(interaction.guild, time, message),
        allowedMentions: { parse: [] },
      });
      return;
    }

    if (sub === 'welcome-preview') {
      // 카드 생성(프로필 사진 다운로드 포함)이 3초를 넘길 수 있음
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const preview = await buildWelcomePreview(interaction.member);
      await interaction.editReply({ ...preview, allowedMentions: { parse: [] } });
      return;
    }

    throw new Error(`알 수 없는 하위 커맨드: ${sub}`);
  },
};

export default settings;
