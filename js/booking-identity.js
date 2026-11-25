'use strict';

const bookingIdentity = (() => {
  let session;
  let dialogRequest;

  function init() {
    if (!session) {
      session = (async () => {
        const app = firebase.apps.find(item => item.name === 'booking-client')
          ?? firebase.initializeApp(firebase.app().options, 'booking-client');
        const clientAuth = app.auth();
        clientAuth.languageCode = 'pt-BR';
        await clientAuth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
        await new Promise((resolve, reject) => {
          const stop = clientAuth.onAuthStateChanged(() => { stop(); resolve(); }, reject);
        });
        return { app, clientAuth };
      })().catch(() => {
        session = undefined;
        throw new Error('Não foi possível iniciar a confirmação por SMS. Tente novamente.');
      });
    }
    return session;
  }

  function prompt(app, clientAuth, phone) {
    const dialog = document.createElement('dialog');
    dialog.className = 'booking-identity-dialog';
    dialog.setAttribute('aria-labelledby', 'bookingIdentityTitle');
    dialog.innerHTML = `
      <h2 id="bookingIdentityTitle">Confirme seu telefone</h2>
      <p data-phone></p>
      <p>O Firebase envia o código por SMS para confirmar que o número é seu.</p>
      <div id="bookingCaptcha"></div>
      <form>
        <div class="field" data-code hidden>
          <label for="bookingCode">Código de seis dígitos</label>
          <input id="bookingCode" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}">
        </div>
        <p data-status role="status" aria-live="polite"></p>
        <div class="my-appt-actions">
          <button type="submit" class="btn btn-primary">Enviar SMS</button>
          <button type="button" class="btn btn-ghost">Voltar</button>
        </div>
      </form>`;
    dialog.querySelector('[data-phone]').textContent = formatPhoneDisplay(phone);
    const form = dialog.querySelector('form');
    const submit = form.querySelector('[type=submit]');
    const back = form.querySelector('[type=button]');
    const status = form.querySelector('[data-status]');
    const codeBox = form.querySelector('[data-code]');
    const code = form.querySelector('#bookingCode');
    const captcha = dialog.querySelector('#bookingCaptcha');
    let verifier;
    let confirmation;

    return new Promise((resolve, reject) => {
      dialog.addEventListener('close', () => {
        verifier?.clear();
        dialog.remove();
        const error = new Error('A confirmação por SMS foi interrompida.');
        error.code = 'phone_confirmation_interrupted';
        reject(error);
      }, { once: true });
      back.addEventListener('click', () => dialog.close());
      form.addEventListener('submit', async event => {
        event.preventDefault();
        submit.disabled = true;
        back.disabled = true;
        status.textContent = confirmation ? 'Conferindo o código…' : 'Enviando SMS…';
        try {
          if (!confirmation) {
            verifier ??= new firebase.auth.RecaptchaVerifier(captcha, { size: 'normal' }, app);
            confirmation = await clientAuth.signInWithPhoneNumber('+55' + phone, verifier);
            captcha.hidden = true;
            codeBox.hidden = false;
            code.required = true;
            submit.textContent = 'Confirmar código';
            status.textContent = 'Digite o código que chegou ao seu telefone.';
            code.focus();
            return;
          }
          const { user } = await confirmation.confirm(code.value);
          resolve(await user.getIdToken());
          dialog.close();
        } catch (error) {
          if (!confirmation) {
            verifier?.clear();
            verifier = undefined;
            captcha.replaceChildren();
            status.textContent = 'Não foi possível enviar o SMS. Confira o número e o reCAPTCHA e tente novamente.';
          } else if (error.code === 'auth/code-expired' || error.code === 'auth/session-expired') {
            status.textContent = 'O código expirou. Volte e solicite um novo SMS.';
          } else {
            status.textContent = 'O código não foi aceito. Confira os seis dígitos e tente novamente.';
          }
        } finally {
          submit.disabled = false;
          back.disabled = false;
        }
      });
      dialog.addEventListener('cancel', event => { if (submit.disabled) event.preventDefault(); });
      document.body.append(dialog);
      dialog.showModal();
      try {
        verifier = new firebase.auth.RecaptchaVerifier(captcha, { size: 'normal' }, app);
        verifier.render().catch(() => { status.textContent = 'O reCAPTCHA não carregou. Tente novamente.'; });
      } catch {
        status.textContent = 'O reCAPTCHA não carregou. Tente novamente.';
      }
    });
  }

  async function tokenForPhone(value, interactive = false) {
    const phone = normalizeBrazilianPhone(value);
    if (!validPhone(phone)) throw new Error('Informe um celular brasileiro válido com DDD.');
    const { app, clientAuth } = await init();
    const user = clientAuth.currentUser;
    if (user && normalizeBrazilianPhone(user.phoneNumber) === phone) {
      const sessionToken = await user.getIdTokenResult();
      if (sessionToken.signInProvider === 'phone') return sessionToken.token;
    }
    if (!interactive) throw new Error('Confirme seu telefone em Meus horários para continuar.');
    if (dialogRequest) throw new Error('Já existe uma confirmação por SMS em andamento.');
    dialogRequest = prompt(app, clientAuth, phone);
    try {
      return await dialogRequest;
    } finally {
      dialogRequest = undefined;
    }
  }

  return { tokenForPhone };
})();
