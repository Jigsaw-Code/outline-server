// Copyright 2020 The Outline Authors
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

import {sleep} from '../infrastructure/async';
import {Survey, Surveys} from '../model/survey';

export enum SurveyId {
  DATA_LIMITS_DISABLED = 'dataLimitsDisabledSurvey',
  DATA_LIMITS_ENABLED = 'dataLimitsEnabledSurvey'
}

enum SurveyLink {
  DATA_LIMITS_DISABLED =
      'https://docs.google.com/forms/d/e/1FAIpQLSc2ZNx0C1a-alFlXLxhJ8jWk-WgcxqKilFoQ5ToI8HBOK9qRA/viewform',
  DATA_LIMITS_ENABLED =
      'https://docs.google.com/forms/d/e/1FAIpQLSeXQ5WUHXQHlF1Ul_ViX52GjTUPlrRB_7rhwbol3dKJfM4Kiw/viewform'
}

export const DEFAULT_PROMPT_IMPRESSION_DELAY_MS = 3000;

export class OutlineSurveys implements Surveys {
  constructor(private view: polymer.Base, private storage: Storage = localStorage) {}

  requestSurvey(surveyId: string, promptImpressionDelayMs: number, displayBefore?: Date) {
    if (surveyId === SurveyId.DATA_LIMITS_ENABLED) {
      return new DataLimitsSurvey(
          this.view, this.storage, surveyId, SurveyLink.DATA_LIMITS_ENABLED,
          promptImpressionDelayMs, displayBefore);
    } else if (surveyId === SurveyId.DATA_LIMITS_DISABLED) {
      return new DataLimitsSurvey(
          this.view, this.storage, surveyId, SurveyLink.DATA_LIMITS_DISABLED,
          promptImpressionDelayMs, displayBefore);
    }
    throw new Error(`Failed to find survey with ID: ${surveyId}`);
  }
}

export class DataLimitsSurvey implements Survey {
  private surveyTitle: string;

  constructor(
      private view: polymer.Base, private storage: Storage, private surveyId: string,
      private surveyLink: string, private promptImpressionDelayMs: number,
      private displayBefore?: Date) {
    this.surveyTitle = view.localize('survey-data-limits-title');
  }

  // Displays a survey dialog for`surveyId` with title `surveyTitle` and a link to `surveyLink`
  // after `promptImppressionDelayMs` has elapsed.
  // Does not display the survey if it has already been shown to the user or if the current date
  // is after `displayBefore`.
  async present() {
    const now = new Date();
    if (this.displayBefore && now > this.displayBefore) {
      return;
    }
    if (this.storage.getItem(this.surveyId)) {
      return;
    }
    await sleep(this.promptImpressionDelayMs);
    this.view.open(this.surveyTitle, this.surveyLink);
    this.storage.setItem(this.surveyId, 'true');
  }
}
