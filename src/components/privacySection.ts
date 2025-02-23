/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { randomLong } from "../helpers/random";
import { InputPrivacyKey, InputPrivacyRule } from "../layer";
import appPrivacyManager, { PrivacyType } from "../lib/appManagers/appPrivacyManager";
import appUsersManager from "../lib/appManagers/appUsersManager";
import { i18n, join, LangPackKey, _i18n } from "../lib/langPack";
import RadioField from "./radioField";
import Row, { RadioFormFromRows } from "./row";
import Scrollable from "./scrollable";
import { SettingSection, generateSection } from "./sidebarLeft";
import AppAddMembersTab from "./sidebarLeft/tabs/addMembers";
import { SliderSuperTabEventable } from "./sliderTab";

type PrivacySectionStr = LangPackKey | '';
export default class PrivacySection {
  public radioRows: Map<PrivacyType, Row>;
  public radioSection: SettingSection;
  public exceptions: Map<keyof PrivacySection['peerIds'], {
    titleLangKey: LangPackKey,
    key: keyof PrivacySection['peerIds'],
    row: Row,
    icon: string,
    subtitleLangKey: LangPackKey,
    clickable: true
  }>;
  public peerIds: {
    disallow?: number[],
    allow?: number[]
  };
  public type: PrivacyType;

  constructor(public options: {
    tab: SliderSuperTabEventable,
    title: LangPackKey, 
    inputKey: InputPrivacyKey['_'], 
    captions?: [PrivacySectionStr, PrivacySectionStr, PrivacySectionStr],
    appendTo?: Scrollable,
    noExceptions?: boolean,
    onRadioChange?: (value: number) => any,
    skipTypes?: PrivacyType[],
    exceptionTexts?: [LangPackKey, LangPackKey]
  }) {
    if(options.captions) {
      options.captions.reverse();
    }

    this.radioSection = new SettingSection({name: options.title, caption: true});

    this.radioRows = new Map();

    let r: Array<{type: PrivacyType, langKey: LangPackKey}> = [{
      type: PrivacyType.Everybody,
      langKey: 'PrivacySettingsController.Everbody'
    }, {
      type: PrivacyType.Contacts,
      langKey: 'PrivacySettingsController.MyContacts'
    }, {
      type: PrivacyType.Nobody,
      langKey: 'PrivacySettingsController.Nobody'
    }];

    if(options.skipTypes) {
      r = r.filter(r => !options.skipTypes.includes(r.type));
    }
    
    const random = randomLong();
    r.forEach(({type, langKey}) => {
      const row = new Row({
        radioField: new RadioField({
          langKey, 
          name: random, 
          value: '' + type
        })
      });
      
      this.radioRows.set(type, row);
    });

    const form = RadioFormFromRows([...this.radioRows.values()], this.onRadioChange);

    this.radioSection.content.append(form);
    if(options.appendTo) {
      options.appendTo.append(this.radioSection.container);
    }

    if(!options.noExceptions) {
      const container = generateSection(options.appendTo, 'PrivacyExceptions', 'PrivacySettingsController.PeerInfo');

      this.exceptions = new Map([[
        'disallow', 
        {
          titleLangKey: options.exceptionTexts[0],
          key: 'disallow',
          row: null,
          icon: 'deleteuser',
          subtitleLangKey: 'PrivacySettingsController.AddUsers',
          clickable: true
        }
      ], [
        'allow', 
        {
          titleLangKey: options.exceptionTexts[1],
          key: 'allow',
          row: null,
          icon: 'adduser',
          subtitleLangKey: 'PrivacySettingsController.AddUsers',
          clickable: true
        }
      ]]);

      this.exceptions.forEach((exception) => {
        exception.row = new Row(exception);

        exception.row.container.addEventListener('click', () => {
          promise.then(() => {
            const _peerIds = this.peerIds[exception.key];
            new AppAddMembersTab(options.tab.slider).open({
              type: 'privacy',
              skippable: true,
              title: exception.titleLangKey,
              placeholder: 'PrivacyModal.Search.Placeholder',
              takeOut: (newPeerIds) => {
                _peerIds.length = 0;
                _peerIds.push(...newPeerIds);
                exception.row.subtitle.innerHTML = '';
                exception.row.subtitle.append(...this.generateStr(this.splitPeersByType(newPeerIds)));
              },
              selectedPeerIds: _peerIds
            });
          });
        });

        container.append(exception.row.container);
      });
    }

    /* setTimeout(() => {
      this.setRadio(PrivacyType.Contacts);
    }, 0); */

    const promise = appPrivacyManager.getPrivacy(options.inputKey).then(rules => {
      const details = appPrivacyManager.getPrivacyRulesDetails(rules);
      this.setRadio(details.type);

      if(this.exceptions) {
        this.peerIds = {};
        (['allow', 'disallow'] as ('allow' | 'disallow')[]).forEach(k => {
          const arr = [];
          const from = k === 'allow' ? details.allowPeers : details.disallowPeers;
          arr.push(...from.users);
          arr.push(...from.chats.map(id => -id));
          this.peerIds[k] = arr;
          const s = this.exceptions.get(k).row.subtitle;
          s.innerHTML = '';
          s.append(...this.generateStr(from));
        });
      }

      options.tab.eventListener.addEventListener('destroy', () => {
        const rules: InputPrivacyRule[] = [];

        switch(this.type) {
          case PrivacyType.Everybody:
            rules.push({_: 'inputPrivacyValueAllowAll'});
            break;
          case PrivacyType.Contacts:
            rules.push({_: 'inputPrivacyValueAllowContacts'});
            break;
          case PrivacyType.Nobody:
            rules.push({_: 'inputPrivacyValueDisallowAll'});
            break;
        }

        if(this.exceptions) {
          ([
            ['allow',     'inputPrivacyValueAllowChatParticipants',     'inputPrivacyValueAllowUsers'],
            ['disallow',  'inputPrivacyValueDisallowChatParticipants',  'inputPrivacyValueDisallowUsers']
          ] as Array<[
            'allow' | 'disallow', 
            'inputPrivacyValueAllowChatParticipants' | 'inputPrivacyValueDisallowChatParticipants', 
            'inputPrivacyValueAllowUsers' | 'inputPrivacyValueDisallowUsers'
          ]>).forEach(([k, chatKey, usersKey], idx) => {
            if(this.exceptions.get(k).row.container.classList.contains('hide')) {
              return;
            }

            const _peerIds: number[] = this.peerIds[k];
            
            if(_peerIds) {
              const splitted = this.splitPeersByType(_peerIds);
              if(splitted.chats.length) {
                rules.push({_: chatKey, chats: splitted.chats.map(peerId => -peerId)});
              }
  
              if(splitted.users.length) {
                rules.push({_: usersKey, users: splitted.users.map(id => appUsersManager.getUserInput(id))});
              }
            }
          });
        }
        
        appPrivacyManager.setPrivacy(options.inputKey, rules);
      }, {once: true});
    });
  }

  private onRadioChange = (value: string | PrivacySection['type']) => {
    value = +value as PrivacySection['type'];
    this.type = value;

    const caption = this.options.captions[this.type];
    const captionElement = this.radioSection.caption;
    if(!caption) {
      captionElement.innerHTML = '';
    } else {
      _i18n(captionElement, caption);
    }
    captionElement.classList.toggle('hide', !caption);

    if(this.exceptions) {
      this.exceptions.get('allow').row.container.classList.toggle('hide', this.type === PrivacyType.Everybody);
      this.exceptions.get('disallow').row.container.classList.toggle('hide', this.type === PrivacyType.Nobody);
    }

    this.options.onRadioChange && this.options.onRadioChange(value);
  };

  public setRadio(type: PrivacySection['type']) {
    const row = this.radioRows.get(type);
    this.onRadioChange(type);
    row.radioField.input.checked = true;
  }
  
  private splitPeersByType(peerIds: number[]) {
    const peers = {users: [] as number[], chats: [] as number[]};
    peerIds.forEach(peerId => {
      peers[peerId < 0 ? 'chats' : 'users'].push(peerId < 0 ? -peerId : peerId);
    });

    return peers;
  }

  private generateStr(peers: {users: number[], chats: number[]}): HTMLElement[] {
    if(!peers.users.length && !peers.chats.length) {
      return [i18n('PrivacySettingsController.AddUsers')];
    }

    return join([
      peers.users.length ? i18n('Users', [peers.users.length]) : null, 
      peers.chats.length ? i18n('Chats', [peers.chats.length]) : null
    ].filter(Boolean), false);
  }
}
