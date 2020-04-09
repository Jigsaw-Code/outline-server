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

import {Surveys} from '../model/survey';

import {InMemoryStorage} from './mocks/mocks';
import {DEFAULT_PROMPT_IMPRESSION_DELAY_MS, OutlineSurveys} from './survey';

describe('Surveys', () => {
  beforeEach(() => {
    // Increase the test timeout to be greater the delay of displaying two surveys.
    jasmine.DEFAULT_TIMEOUT_INTERVAL = DEFAULT_PROMPT_IMPRESSION_DELAY_MS * 3;
  });

  it('presents data limits surveys with the correct arguments', async (done) => {
    const view = new FakeSurveyDialog();
    const storage = new InMemoryStorage();
    const surveys = new OutlineSurveys(view, storage);

    await surveys.presentDataLimitsEnabledSurvey();
    expect(view.title).toEqual('survey-data-limits-title');
    expect(view.surveyLink)
        .toEqual(
            'https://docs.google.com/forms/d/e/1FAIpQLSeXQ5WUHXQHlF1Ul_ViX52GjTUPlrRB_7rhwbol3dKJfM4Kiw/viewform');

    await surveys.presentDataLimitsDisabledSurvey();
    expect(view.title).toEqual('survey-data-limits-title');
    expect(view.surveyLink)
        .toEqual(
            'https://docs.google.com/forms/d/e/1FAIpQLSc2ZNx0C1a-alFlXLxhJ8jWk-WgcxqKilFoQ5ToI8HBOK9qRA/viewform');
    done();
  });

  it('presents data limits surveys after the default prompt impression delay', async (done) => {
    const view = new FakeSurveyDialog();
    const storage = new InMemoryStorage();
    const surveys = new OutlineSurveys(view, storage);

    let start = Date.now();
    await surveys.presentDataLimitsEnabledSurvey();
    let delay = Date.now() - start;
    expect(delay).toBeGreaterThanOrEqual(DEFAULT_PROMPT_IMPRESSION_DELAY_MS);

    start = Date.now();
    await surveys.presentDataLimitsDisabledSurvey();
    delay = Date.now() - start;
    expect(delay).toBeGreaterThanOrEqual(DEFAULT_PROMPT_IMPRESSION_DELAY_MS);
    done();
  });

  it('presents data limits surveys once', async (done) => {
    const view = new FakeSurveyDialog();
    const storage = new InMemoryStorage();
    const surveys = new OutlineSurveys(view, storage);

    await surveys.presentDataLimitsEnabledSurvey();
    expect(storage.getItem('dataLimitsEnabledSurvey')).toEqual('true');
    await surveys.presentDataLimitsDisabledSurvey();
    expect(storage.getItem('dataLimitsDisabledSurvey')).toEqual('true');

    spyOn(view, 'open');
    await surveys.presentDataLimitsEnabledSurvey();
    expect(view.open).not.toHaveBeenCalled();
    await surveys.presentDataLimitsDisabledSurvey();
    expect(view.open).not.toHaveBeenCalled();
    done();
  });

  it('does not present data limits surveys after availability date', async (done) => {
    const view = new FakeSurveyDialog();
    const storage = new InMemoryStorage();
    const yesterday = new Date(new Date().setDate(new Date().getDate() - 1));
    const surveys = new OutlineSurveys(view, storage, yesterday);
    spyOn(view, 'open');

    await surveys.presentDataLimitsEnabledSurvey();
    expect(view.open).not.toHaveBeenCalled();
    await surveys.presentDataLimitsDisabledSurvey();
    expect(view.open).not.toHaveBeenCalled();
    done();
  });
});

class FakeSurveyDialog implements polymer.Base {
  title: string;
  surveyLink: string;
  is: 'fake-survey-dialog';
  localize(messageId: string) {
    return messageId;
  }
  open(title: string, surveyLink: string) {
    this.title = title;
    this.surveyLink = surveyLink;
  }
}
