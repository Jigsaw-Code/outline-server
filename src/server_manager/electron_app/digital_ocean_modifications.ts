// Copyright 2018 The Outline Authors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import * as electron from 'electron';

const ipcRenderer = electron.ipcRenderer;

export function modifyUiIfDigitalOcean() {
  // Wait for load event, to ensure that the currentUser object is loaded.
  // For most signed-in DigitalOcean pages, currentUser is set via inline
  // <script> tags in the HTML <head>.
  window.addEventListener('load', () => {
    if (window.location.host === 'cloud.digitalocean.com') {
      const DIGITAL_OCEAN_POLLING_INTERVAL = 200;
      let lastScreen: DigitalOceanScreen;
      const updateUIOnScreenChange = () => {
        getActiveDigitalOceanScreen().then((activeScreen: DigitalOceanScreen) => {
          if (activeScreen === lastScreen) {
            // Screen hasn't changed, nothing to do.
            return;
          } else if (activeScreen === DigitalOceanScreen.CREATE_DROPLETS) {
            // User is on droplet creation screen, redirect them to OAuth
            redirectToOAuth();
          } else if (activeScreen === DigitalOceanScreen.EMAIL_VERIFICATION) {
            updateUIForEmailVerification();
          } else if (activeScreen === DigitalOceanScreen.BILLING) {
            updateUIForBilling();
          } else if (activeScreen === DigitalOceanScreen.OAUTH) {
            if (!isBillingEnabled()) {
              // User has not entered any billing info, redirect them to the
              // welcome screen before they can complete OAuth.  Without
              // entering billing info, users cannot create droplets.
              window.location.replace('https://cloud.digitalocean.com/welcome');
              return;
            }
            updateUIForOAuth();
          } else if (activeScreen === DigitalOceanScreen.REGISTRATION) {
            updateUIForRegistration();
          } else {
            updateUIForUnknownDigitalOcean();
          }
          lastScreen = activeScreen;
        });
      };
      setInterval(updateUIOnScreenChange, DIGITAL_OCEAN_POLLING_INTERVAL);
      updateUIOnScreenChange();  // Invoke immediately to not wait for the interval.
      blockDigitalOceanNotifications();
    } else if (window.location.host.indexOf('digitalocean.com') >= 0) {
      updateUIForUnknownDigitalOcean();
    }
  });
}

// Screens in DigitalOcean signup process.
enum DigitalOceanScreen {
  // User is not on DigitalOcean or is on an unknown screen.
  NONE = 0,
  // User is being asked to verify their email address.
  EMAIL_VERIFICATION,
  // User is being asked for billing, after verifying their email.
  BILLING,
  // User is being asked to create their first droplet.
  CREATE_DROPLETS,
  // User is asked to permission Outline to modify their DigitalOcean account.
  OAUTH,
  // User is entering the email and password for registering a new DigitalOcean account.
  REGISTRATION

  // TODO(dborkan): These screens are not yet used but will be as we improve upon
  // the DigitalOcean sign up.
  // LOGIN,
}

// Create a promise to be fulfilled when window.onload is fired.
const onceWindowOnload = new Promise((fulfill, reject) => {
  window.addEventListener('load', fulfill);
});

class DigitalOceanUser {
  constructor(private uuid: string) {}
  // Requires that this.uuid is the user currently logged in and that we
  // are on cloud.digitalocean.com, so that XHR passes the correct
  // authentication cookies to DigitalOcean.
  public getOnboardingStep(): Promise<string> {
    const url = 'https://cloud.digitalocean.com/api/v1/users/' + this.uuid;
    return new Promise((fulfill, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url);
      xhr.onload = function() {
        try {
          fulfill(JSON.parse(this.response).user.onboarding_step);
        } catch (e) {
          // Error parsing user.
          reject(new Error('Error getting onboarding_step: ' + e));
        }
      }.bind(xhr);
      xhr.onerror = (e: ErrorEvent) => {
        reject(new Error('Error refreshing user: ' + e));
      };
      xhr.send();
    });
  }
}

function redirectToOAuth() {
  // Use client_id and redirect_uri set for Outline electron app.
  // Note we cannot include the web_app/main.ts or cloud/digitalocean_api.ts
  // libraries in this file due to them being located outside the electron_app
  // root directory.
  // TODO(dborkan): refactor DigitalOcean OAuth library for use in both the electron_app
  // and web_app compilation steps.
  window.location.href = 'https://cloud.digitalocean.com/v1/oauth/authorize' +
      '?client_id=b171ddd0ee117cc0258cf1a4e8b75c0896a0a2d99724af30770de6d9c2eea71e' +
      '&response_type=token' +
      '&redirect_uri=' + encodeURIComponent('https://www.getoutline.org/digitalocean_oauth') +
      '&state=' +
      '&scope=read%20write';
}

interface DigitaloceanWindow extends Window {
  currentUser: {uuid: string; payment_method: string;};
}

function getActiveDigitalOceanScreen(): Promise<DigitalOceanScreen> {
  // First, handle the case where we just ignore
  if (window.location.host !== 'cloud.digitalocean.com') {
    return Promise.resolve(DigitalOceanScreen.NONE);
  }

  // Note: /droplets URL is also used for the EMAIL_VERIFICATION screen,
  // don't depend on it.
  const digitalOceanScreenByPathname: {[path: string]: DigitalOceanScreen} = {
    // TODO(dborkan): for future DigitalOcean sign up enhancements, we can use
    // more of this map of pathname to DigitalOceanScreen.
    '/v1/oauth/authorize': DigitalOceanScreen.OAUTH,
    // '/login': DigitalOceanScreen.LOGIN,
    '/registrations/new': DigitalOceanScreen.REGISTRATION
  };
  if (window.location.pathname in digitalOceanScreenByPathname) {
    return Promise.resolve(digitalOceanScreenByPathname[window.location.pathname]);
  }

  // Create a DigitalOceanUser based on the global currentUser set by
  // DigitalOcean.
  const globalCurrentUser = (window as DigitaloceanWindow).currentUser;
  if (!globalCurrentUser || !globalCurrentUser.uuid) {
    return Promise.resolve(DigitalOceanScreen.NONE);
  }
  const digitalOceanUser = new DigitalOceanUser(globalCurrentUser.uuid);

  // Return DigitalOceanScreen based on the user's onboarding step
  return digitalOceanUser.getOnboardingStep()
      .then((onboardingStep: string) => {
        if (onboardingStep === 'activated' || onboardingStep === 'established') {
          // User may either be on the /welcome screen "Create Droplets" step or
          // the /droplets screen.
          return DigitalOceanScreen.CREATE_DROPLETS;
        } else if (onboardingStep === 'confirmed') {
          return DigitalOceanScreen.BILLING;
        } else if (onboardingStep === 'registered') {
          return DigitalOceanScreen.EMAIL_VERIFICATION;
        }
        return DigitalOceanScreen.NONE;
      })
      .catch((e: Error) => {
        // currentUser.onboarding_step is not available, not an error.
        return DigitalOceanScreen.NONE;
      });
}

// Like Chrome js console's `$` function.
function $(selector: string, root = document): HTMLElement {
  // Need to cast return type as HTMLElement to get around TypeScript
  // Property 'style' does not exist on type 'Element' errors.
  return root.querySelector(selector) as HTMLElement;
}

// Like Chrome js console's `$$` function.
function $$(selector: string, root = document): HTMLElement[] {
  return Array.prototype.slice.call(root.querySelectorAll(selector));
}

function hideBySelector(selector: string) {
  return $$(selector).forEach((el: HTMLElement) => {
    el.style.display = 'none';
  });
}

function updateDigitalOceanWelcomeStyles() {
  const isReady = $$('.welcome-stages').length > 0;
  if (!isReady) {
    // Welcome pages are not yet fully set up, try again later.
    const WELCOME_STYLE_RETRY_MS = 200;
    setTimeout(updateDigitalOceanWelcomeStyles, WELCOME_STYLE_RETRY_MS);
    return;
  }

  // Remove minimum width so everything can fit inside our electron window.
  const auroraContainer = $('#aurora-container');
  if (auroraContainer) {
    auroraContainer.style.minWidth = '0';
  }
  // Set width container width to 100% to remove margins.
  const welcomeStages = $$('.welcome-stages');
  if (welcomeStages.length > 0) {
    welcomeStages[0].style.width = '100%';
  }
  // Hide creation steps, since they mention a 3rd "Create Droplet" step.
  hideBySelector('.creation-steps');
  // Hide nav-bar to remove welcome and support links.
  hideBySelector('.nav-bar');
}

function updateUIForEmailVerification() {
  onceWindowOnload.then(() => {
    updateDigitalOceanWelcomeStyles();
    const bannerText =
        'Confirm your email and continue here. Close the DigitalOcean browser window once your email is confirmed.';
    addDigitalOceanSignupBanner(bannerText);
    addDigitalOceanFooter();
  });
}

function updateUIForOAuth() {
  onceWindowOnload.then(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      /* Remove minimum width so everything can fit inside our electron window. */
      #aurora-container, #aurora-container .nav_controls_v2 {
        min-width: 0;
      }
      /* Set a reasonable padding. */
      .fleets-container #aurora-container {
        padding-bottom: 75px;
      }
      /* Widen column so more text fits above-the-fold. */
      #aurora-container .aurora-body .small-8.columns.small-centered.u-textAlignCenter {
        width: 100%;
        padding: 20px;
      }
      /* Fix word break of titles. */
      #aurora-container .aurora-body .small-8.columns.small-centered.u-textAlignCenter h1 {
        word-break: normal;
      }
      /* Hide nav-bar and bottom container. */
      .nav-bar, .cloud-container.nav-has-loaded {
        display: none;
      }
    `;
    document.body.appendChild(style);
    const bannerText =
        'Give Outline permission to use your DigitalOcean account.  This will only be used to install the Outline server software.';
    addDigitalOceanSignupBanner(bannerText);
    addDigitalOceanFooter();
  });
}

function updateUIForRegistration() {
  onceWindowOnload.then(() => {
    hideBySelector('.logo');
    hideBySelector('.registration-message');
    const bannerText =
        'Sign up with DigitalOcean to get a server with 1 TB of data transfer for $5 USD per month.  Cancel at anytime.';
    addDigitalOceanSignupBanner(bannerText);
    addDigitalOceanFooter();
    // Add topMargin to #new_user
    const newUser = $('#new_user');
    if (newUser) {
      newUser.style.marginTop = '20px';
    }
  });
}

function updateUIForUnknownDigitalOcean() {
  onceWindowOnload.then(() => {
    addDigitalOceanSignupBanner();
    addDigitalOceanFooter();
    // Hide DigitalOcean header (e.g. from https://www.digitalocean.com/legal/privacy/)
    // and undo top margin to bring Outline header to the top of the page.
    hideBySelector('.Page-header');
    const htmlNode = document.childNodes[1] as HTMLElement;
    if (htmlNode && htmlNode.nodeName === 'HTML') {
      htmlNode.style.marginTop = '0';
    }
  });
}

function updateUIForBilling() {
  onceWindowOnload.then(() => {
    // Bring electron window to the front, as user was probably just redirected
    // to the billing screen in their default web browser.
    ipcRenderer.send('bring-to-front');
    updateDigitalOceanWelcomeStyles();
    const bannerText =
        'DigitalOcean will charge you $5 USD a month for your server. You can cancel at anytime.';
    addDigitalOceanSignupBanner(bannerText);
    addDigitalOceanFooter();
  });
}

function addDigitalOceanSignupBanner(text?: string) {
  // Check if banner already exists (e.g. it may exist if the user advanced from
  // the email-verification to billing screens without the screen being completely
  // cleared);
  let bannerDiv = document.getElementById('outlineBanner');
  if (!bannerDiv) {
    bannerDiv = document.createElement('div');
    bannerDiv.id = 'outlineBanner';
    document.body.insertBefore(bannerDiv, document.body.firstChild);
  }

  // Set global function to take the user back to the Outline home screen.
  // tslint:disable-next-line:no-any
  (window as any).showOutlineHome = () => {
    // .go takes the offset from the current page.  To return to the Outline
    // home, we need to go back to page 1.  e.g. if window.history.length is
    // 3, we need to go -2 pages.
    window.history.go(-1 * (window.history.length - 1));
  };

  // Set the HTML for the banner.  Since the banner will appear on DigitalOcean pages,
  // we should not rely on any frameworks like Polymer, as they might conflict with
  // existing frameworks on those pages.
  // All class names should begin with Outline to ensure no collisions.
  // The outline:// protocol should be marked secure to avoid mixed content warnings.
  bannerDiv.innerHTML = `
      <link href="outline://web_app/bower_components/font-roboto/roboto.html" rel="import">
      <style>
        #outlineBanner {
          font-family: "Roboto", sans-serif;
          font-size: 14px;
          font-weight: 400;
          color: rgba(0,0,0,0.54);
          background-color: #FAFAFA;
          box-shadow: 0 3px 5px 0 rgba(0,0,0,0.10), 0 2px 4px 0 rgba(0,0,0,0.1), 0 4px 4px 0 rgba(0,0,0, .12);
        }
         #outlineBanner .getStarted{
          font-family: "Roboto", sans-serif;
          font-size: 18px;
          color: #ffffff;
          line-height: 32px;
          font-weight: 400;
          margin-left: 24px;
        }
        #outlineBanner .outlineAppHeader {
          background-color: #263238;
          height: 64px;
          padding: 16px;
        }
        #outlineBanner .outlineAppHeader a {
          cursor: pointer;
        }
        #outlineBanner .outlineStep {
          display: inline-block;
        }
        #outlineBanner .outlineStepContainer {
          padding: 24px 0px 24px 0px;
          text-align: center;
        }
        #outlineBanner .outlineStepContainer hr {
          width: 46px;
          border-width: 0px 0px 1px 0px;
          border-style: solid;
          border-color: rgba(0, 0, 0, 0.24);
          margin: 0px 24px 2px 24px;
          border: 1px, 1px, 1px, 1px;
          display: inline-block;
        }
        #outlineBanner .outlineStepCircle {
          color: white;
          background-color: black;
          border-radius: 50%;
          width: 26px;
          height: 26px;
          display: inline-block;
          vertical-align: middle;
        }
        #outlineBanner .stepTextTwo {
          font-weight: 500;
          font-family: "Roboto", sans-serif;
          color: rgba(0,0,0,0.34);
          margin-left: 12px;
        }
        #outlineBanner .stepTextOne {
          font-family: "Roboto", sans-serif;
          color: rgba(0,0,0,0.87);
          font-weight: 500;
          margin-left: 12px;
        }
        #outlineBanner .outlineStepNumber {
          font-family: "Roboto", sans-serif;
          padding-top: 5px;
        }
        #outlineBanner .outlineText {
          font-family: "Roboto", sans-serif;
          font-weight: 400;
          line-height: 28px;
          font-size: 14px;
          padding: 0px 12% 24px 12%;
          text-align: center;
          color: rgba(0, 0, 0, 0.87);
        }

      </style>
      <div class='outlineAppHeader'>
        <a onclick="showOutlineHome()"><img src="outline://web_app/images/back.svg"></a>
            <span class="getStarted">Get started</span>
      </div>
  `;
  if (text) {
    bannerDiv.innerHTML += `
        <div class="outlineStepContainer">
          <div class="outlineStep">
            <span class="outlineStepCircle"><div class="outlineStepNumber">1</div></span>
            <span class="stepTextOne">Choose a server</span>
          </div>
          <hr></hr>
          <div class="outlineStep">
            <span class="outlineStepCircle" style="background-color: #b8b8b8"><div class="outlineStepNumber">2</div></span>
            <span class="stepTextTwo">Set up Outline</span>
          </div>
        </div>
        <div class='outlineText'>${text}</div>
    `;
  }
}

function addDigitalOceanFooter() {
  if (document.getElementById('outlineFooter')) {
    // Footer already exists (e.g. it may exist if the user advanced from
    // the email-verification to billing screens without the screen being completely
    // cleared).
    return;
  }
  const footerDiv = document.createElement('div');
  footerDiv.id = 'outlineFooter';
  footerDiv.innerHTML = `
    <style>
      #outlineFooter {
        font-family: "Roboto", sans-serif;
        font-size: 12px;
        font-weight: 400;
        color: rgba(0,0,0,0.54);
        background-color: #ECEFF1;
        text-align: right;
        padding: 6px 0 6px 0;
        position: fixed;
        bottom: 0;
        width: 100%;
      }
      #outlineFooter a {
        text-decoration: none;
        padding-right: 20px;
        color: rgba(0,0,0,0.54);
      }
    </style>
    <a href="https://s3.amazonaws.com/outline-vpn/index.html#/support/dataCollection">Data Collection</a>
    <a href="https://www.google.com/policies/privacy/">Privacy</a>
    <a href="https://s3.amazonaws.com/outline-vpn/static_downloads/Outline-Terms-of-Service.html">Terms</a>
  `;
  document.body.insertBefore(footerDiv, null);
}

function blockDigitalOceanNotifications() {
  function dismiss() {
    hideBySelector('.Modal-backdrop');
    hideBySelector('.aurora-news-modal');
    // Hide notifications like "NYC Network Connectivity".
    hideBySelector('.status-notification');
  }
  // Attempt to dismiss popups every DISMISS_INTERVAL_MS.
  const DISMISS_INTERVAL_MS = 1000;
  setInterval(dismiss, DISMISS_INTERVAL_MS);
  dismiss();
}

function isBillingEnabled(): boolean {
  const currentUser = (window as DigitaloceanWindow).currentUser;
  return currentUser && currentUser.payment_method !== null;
}
