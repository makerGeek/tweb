/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type { CancellablePromise } from '../helpers/cancellablePromise';
import type { InputFile } from '../layer';
import type { AuthState } from '../types';
import Button from '../components/button';
import InputField from '../components/inputField';
import { putPreloader } from '../components/misc';
import PopupAvatar from '../components/popups/avatar';
import appStateManager from '../lib/appManagers/appStateManager';
import I18n, { i18n } from '../lib/langPack';
//import apiManager from '../lib/mtproto/apiManager';
import apiManager from '../lib/mtproto/mtprotoworker';
import RichTextProcessor from '../lib/richtextprocessor';
import LoginPage from './loginPage';
import Page from './page';
import blurActiveElement from '../helpers/dom/blurActiveElement';
import replaceContent from '../helpers/dom/replaceContent';

let authCode: AuthState.signUp['authCode'] = null;

const onFirstMount = () => import('../lib/appManagers/appProfileManager').then(imported => {
  const page = new LoginPage({
    className: 'page-signUp',
    withInputWrapper: true,
    titleLangKey: 'YourName',
    subtitleLangKey: 'Login.Register.Subtitle'
  });

  page.imageDiv.classList.add('avatar-edit');

  page.title.classList.add('fullName');

  const avatarPreview = document.createElement('canvas');
  avatarPreview.id = 'canvas-avatar';
  avatarPreview.className = 'avatar-edit-canvas';

  const addIco = document.createElement('span');
  addIco.className = 'tgico tgico-cameraadd';

  page.imageDiv.append(avatarPreview, addIco);
  
  const appProfileManager = imported.default;

  let uploadAvatar: () => CancellablePromise<InputFile>;
  page.imageDiv.addEventListener('click', () => {
    new PopupAvatar().open(avatarPreview, (_uploadAvatar) => {
      uploadAvatar = _uploadAvatar;
    });
  });

  const handleInput = (e: Event) => {
    const name = nameInputField.value || '';
    const lastName = lastNameInputField.value || '';

    const fullName = name || lastName 
      ? (name + ' ' + lastName).trim() 
      : '';
    
    if(fullName) replaceContent(page.title, RichTextProcessor.wrapEmojiText(fullName));
    else replaceContent(page.title, i18n('YourName'));
  };

  let sendAvatar = () => new Promise<void>((resolve, reject) => {
    if(!uploadAvatar) {
      //console.log('User has not selected avatar');
      return resolve();
    }

    //console.log('invoking uploadFile...');
    uploadAvatar().then((inputFile) => {
      //console.log('uploaded smthn', inputFile);
  
      appProfileManager.uploadProfilePhoto(inputFile).then(resolve, reject);
    }, reject);
  });

  const nameInputField = new InputField({
    label: 'FirstName',
    maxLength: 70
  });

  const lastNameInputField = new InputField({
    label: 'LastName',
    maxLength: 64
  });

  const btnSignUp = Button('btn-primary btn-color-primary');
  const btnI18n = new I18n.IntlElement({key: 'StartMessaging'});
  btnSignUp.append(btnI18n.element);

  page.inputWrapper.append(nameInputField.container, lastNameInputField.container, btnSignUp);

  nameInputField.input.addEventListener('input', handleInput);
  lastNameInputField.input.addEventListener('input', handleInput);

  btnSignUp.addEventListener('click', function(this: typeof btnSignUp, e) {
    if(nameInputField.input.classList.contains('error') || lastNameInputField.input.classList.contains('error')) {
      return false;
    }

    if(!nameInputField.value.length) {
      nameInputField.input.classList.add('error');
      return false;
    }

    this.disabled = true;

    const name = nameInputField.value.trim();
    const lastName = lastNameInputField.value.trim();

    const params = {
      phone_number: authCode.phone_number,
      phone_code_hash: authCode.phone_code_hash,
      first_name: name,
      last_name: lastName
    };

    //console.log('invoking auth.signUp with params:', params);

    btnI18n.update({key: 'PleaseWait'});
    const preloader = putPreloader(this);

    apiManager.invokeApi('auth.signUp', params)
    .then((response) => {
      //console.log('auth.signUp response:', response);
      
      switch(response._) {
        case 'auth.authorization': // success
          apiManager.setUserAuth(response.user.id);

          sendAvatar().finally(() => {
            import('./pageIm').then(m => {
              m.default.mount();
            });
          });
          
          break;
        default:
          btnI18n.update({key: response._ as any});
          this.removeAttribute('disabled');
          preloader.remove();
          break;
      }

      /* (document.body.getElementsByClassName('page-sign')[0] as HTMLDivElement).style.display = 'none';
      pageAuthCode(Object.assign(code, {phoneNumber})); */
    }).catch(err => {
      this.removeAttribute('disabled');
      preloader.remove();

      switch(err.type) {
        default:
          btnI18n.update({key: err.type});
          break;
      }
    });
  });

  blurActiveElement();
  return new Promise((resolve) => {
    window.requestAnimationFrame(resolve);
  });
});

const page = new Page('page-signUp', true, onFirstMount, (_authCode: typeof authCode) => {
  authCode = _authCode;

  appStateManager.pushToState('authState', {_: 'authStateSignUp', authCode: _authCode});
});

export default page;
