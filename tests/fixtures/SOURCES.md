# Test image sources

`mediapipe-right-hands.jpg` is the MediaPipe project's official `right_hands.jpg`
test asset, downloaded on 2026-10-18 from:
https://storage.googleapis.com/mediapipe-assets/right_hands.jpg

It is used only for automated regression testing, not as site artwork. The
fixture shows right hands in different orientations. The browser test pads the
image before inference and uses a cropped upright right hand as a synthetic
camera input. The model and Worker are real; no physical webcam is tested.

`character.png` is the project's pre-existing synthetic character test fixture.
