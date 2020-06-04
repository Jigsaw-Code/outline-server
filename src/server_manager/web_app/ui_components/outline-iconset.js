/*
  Copyright 2018 The Outline Authors

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/

import '@polymer/iron-iconset-svg/iron-iconset-svg.js';
import {html} from '@polymer/polymer/lib/utils/html-tag.js';

const template = html`<iron-iconset-svg name="outline-iconset" size="24">
  <svg>
    <defs>
      <g id="outline">
        <path d="M10,18 C14.418278,18 18,14.418278 18,10 C18,5.581722 14.418278,2 10,2 C5.581722,2 2,5.581722 2,10 C2,14.418278 5.581722,18 10,18 Z M10,20 C4.4771525,20 0,15.5228475 0,10 C0,4.4771525 4.4771525,0 10,0 C15.5228475,0 20,4.4771525 20,10 C20,15.5228475 15.5228475,20 10,20 Z" id="Oval-2-Copy-75"></path>
        <path d="M10,18 C12.7614237,18 15,15.7614237 15,13 C15,10.2385763 12.7614237,8 10,8 C7.23857625,8 5,10.2385763 5,13 C5,15.7614237 7.23857625,18 10,18 Z M10,20 C6.13400675,20 3,16.8659932 3,13 C3,9.13400675 6.13400675,6 10,6 C13.8659932,6 17,9.13400675 17,13 C17,16.8659932 13.8659932,20 10,20 Z" id="Oval-2-Copy-76"></path>
        <path d="M10,18 C11.1045695,18 12,17.1045695 12,16 C12,14.8954305 11.1045695,14 10,14 C8.8954305,14 8,14.8954305 8,16 C8,17.1045695 8.8954305,18 10,18 Z M10,20 C7.790861,20 6,18.209139 6,16 C6,13.790861 7.790861,12 10,12 C12.209139,12 14,13.790861 14,16 C14,18.209139 12.209139,20 10,20 Z" id="Oval-2-Copy-77"></path>
      </g>
      <g id="devices">
        <path d="M4 6h18V4H4c-1.1 0-2 .9-2 2v11H0v3h14v-3H4V6zm19 2h-6c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h6c.55 0 1-.45 1-1V9c0-.55-.45-1-1-1zm-1 9h-4v-7h4v7z"></path>
      </g>
      <g id="share">
        <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"></path>
      </g>
      <g id="key">
        <path d="M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"></path>
      </g>
    </defs>
  </svg>
</iron-iconset-svg>`;

document.head.appendChild(template.content);
