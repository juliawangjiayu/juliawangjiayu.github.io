export type AboutLink = { label: string; href: string };

export type AboutContent = {
  recentlyInterestedIn: string[];
  wechatOfficialAccount: string;
  links: AboutLink[];
};

export type AboutSection = {
  id: 'interests' | 'wechat' | 'links';
  title: string;
  items: string[];
};

export const aboutContent: AboutContent = {
  recentlyInterestedIn: [
    'Walking without a route',
    'How cities remember',
  ],
  wechatOfficialAccount: '',
  links: [],
};

export function visibleAboutSections(content: AboutContent): AboutSection[] {
  const sections: AboutSection[] = [];
  if (content.recentlyInterestedIn.length > 0) {
    sections.push({
      id: 'interests',
      title: 'Recently interested in',
      items: content.recentlyInterestedIn,
    });
  }
  if (content.wechatOfficialAccount.trim()) {
    sections.push({
      id: 'wechat',
      title: 'Personal WeChat Official Account',
      items: [content.wechatOfficialAccount.trim()],
    });
  }
  if (content.links.length > 0) {
    sections.push({
      id: 'links',
      title: 'Elsewhere',
      items: content.links.map((link) => link.label),
    });
  }
  return sections;
}
