# 모션 아케이드 외부 소스·자원 고지

## 사용자가 제공한 게임

- `temp_gameFile/공룡게임.html` (CHICK RUNNER): 점프·숙이기 상태, 장애물과 패딩을 둔 사각형 충돌 구조를 참고해 공통 어댑터로 재구현했습니다. 기존 HTML은 수정하지 않았습니다.
- `temp_gameFile/테트리스.html` (정보축전 2026 - 테트리스 PRO): 4×4 셀 인덱스 기반 블록 회전표를 `src/games/engines.ts`에 이식하고, 이동·회전·고스트·줄 삭제 규칙을 참고했습니다. 프레임 단위 낙하는 경과 시간 기반으로 교체했습니다. 기존 HTML은 수정하지 않았습니다.
- 제공된 HTML에는 명시적인 저작권/라이선스 고지가 없었습니다. 사용자 제공 소스로 개발에 사용했으며, 공개 재배포 권한을 별도로 부여한다고 해석하지 않습니다. 원본의 Tailwind CDN, Google Fonts, 음악·테마 UI는 새 앱에서 로드하지 않습니다.
- 균형 게임, 기본 캐릭터 SVG, 로비 일러스트와 새 앱 코드는 이 프로젝트를 위해 작성했습니다. Chromium 디노 소스를 가져오지 않았으며 원본 Chrome 게임이라고 소개하지 않습니다.

## 실행 시 포함되는 라이브러리와 모델

| 항목 | 고정 버전 | 라이선스/출처 |
| --- | --- | --- |
| React / React DOM | 19.3.1 | MIT, 각 npm 패키지 LICENSE |
| lucide-react | 0.468.0 | ISC, 패키지 LICENSE의 개별 아이콘 저작권 고지 포함 |
| MediaPipe Tasks Vision JS + WASM | 0.10.32 | Apache-2.0, Google / MediaPipe Authors |
| Hand Landmarker float16 | 모델 revision 1 | Apache-2.0, 아래 공식 모델 카드 |
| Pose Landmarker Lite float16 | 모델 revision 1 | Apache-2.0, 아래 공식 모델 카드 |

모델 URL, 파일 크기와 SHA-256은 `public/models/manifest.json`에 고정했습니다. 패키지와 WASM은 같은 npm 배포물에서 준비합니다. `scripts/download-models.mjs`는 기존 manifest의 해시와 다른 파일을 거부합니다.

- [MediaPipe 저장소 라이선스](https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE)
- [손 모델 카드, 2쪽 LICENSED UNDER](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Hand%20Tracking%20%28Lite_Full%29%20with%20Fairness%20Oct%202021.pdf)
- [몸 모델 카드, 2쪽 LICENSED UNDER](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf)
- [Hand Landmarker 공식 웹 API](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js)
- [Pose Landmarker 공식 웹 API](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js)

Apache-2.0 사용 조건에는 라이선스 사본 제공과 적용되는 고지 보존 등이 포함됩니다. 빌드 시 이 파일과 실행 라이브러리 라이선스를 `dist/notices/`에 포함합니다. MIT·ISC 라이선스도 해당 저작권 및 허가 문구를 함께 보존합니다. 개발 의존성의 고지는 각 npm 패키지에 있습니다.

## 통신과 개인정보

앱은 카메라 영상·관절 좌표를 업로드하거나 녹화하지 않습니다. Worker는 로컬에 제공되는 모델·WASM으로 추론합니다. 검토한 `vision_bundle.mjs`의 fetch 경로는 모델·그래프 파일 로더이며, 이 앱은 로컬 URL을 전달합니다. JS·WASM·모델을 제3자 CDN에서 실행 중에 가져오지 않습니다. 분석 SDK나 자체 전송 코드를 추가하지 않았습니다.

설치 시 npm 레지스트리와 Google 공식 모델 저장소에 파일 다운로드 요청이 발생합니다. 사이트 접속 시에는 호스팅 서버에 정적 파일 요청이 전송될 수 있습니다. 이는 카메라 영상 업로드와 별개입니다. 배포 환경의 서버 로그·추가 스크립트 정책은 운영자가 관리해야 합니다.
