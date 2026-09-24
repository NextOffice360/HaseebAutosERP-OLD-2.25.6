Yes — I researched this specifically around Google Apps Script + HTMLService + mobile live camera + QR/barcode scanning, including Google’s current Apps Script documentation, browser camera security documentation, the current html5-qrcode project, and recent developer reports.

The important finding
Your problem is probably not your QR-scanning library. It is the Google Apps Script HTMLService environment.

Google's own current Apps Script troubleshooting documentation explicitly says that HTMLService applications can receive a “Permissions policy violation” when they call:

navigator.mediaDevices.getUserMedia()

for camera/microphone access. Google says the Apps Script sandbox restricts these sensitive Web APIs and recommends hosting the camera functionality on a separate domain outside Apps Script, opening it in a new window/tab, and sending the captured result back to Apps Script. 
G
Google for Developers
+1

This is particularly important because there are very recent developer reports from February 2026 of Apps Script QR scanners suddenly receiving:

Permissions policy violation: camera is not allowed in this document

and:

NotAllowedError: Permission denied

even though the same Apps Script application previously worked. 
G
Google Developer forums

So I would not spend much time trying to fix this by changing QR libraries inside your Apps Script HTML page.

Why barcode may work while QR camera doesn't
There are actually two different operations that can be confused:

1. Scanning an uploaded photograph
The browser lets the user choose:

<input type="file" accept="image/*" capture="environment">

The QR library processes the resulting image.

This can work even when live camera access is prohibited.

2. Live camera scanning
This normally requires:

navigator.mediaDevices.getUserMedia({
    video: {
        facingMode: "environment"
    }
});

That is a powerful browser API requiring camera permission.

Browsers require HTTPS and permission, and camera access can additionally be blocked by the document's Permissions Policy. 
M
MDN Web Docs
+1

Apps Script HTMLService runs your HTML inside Google's sandboxed iframe environment. Google documents that HTMLService uses iframe sandboxing and imposes restrictions on client-side functionality. 
G
Google for Developers
+1

That is the critical architectural issue.

What I recommend for your application
Since your database is already:

Google Apps Script → Google Sheets

you don't need to abandon Apps Script.

Instead, split the application into two parts:

                 YOUR WEB APP
                     │
          ┌──────────┴──────────┐
          │                     │
    Main application        Camera scanner
          │                     │
    Apps Script URL        External HTTPS URL
          │                     │
          │                Mobile camera
          │                     │
          │                 QR decoder
          │                     │
          └────── scanned value ┘
                     │
                     ▼
             Apps Script
                     │
                     ▼
                Google Sheet

This is essentially the architecture Google itself recommends for camera access from Apps Script. 
G
Google for Developers

Option A — Separate QR scanner page
This is the solution I would investigate first.

Your Apps Script application could have:

https://script.google.com/.../exec

and your scanner could be hosted separately, for example:

https://your-scanner-domain.com/

When the user presses:

Scan QR

your Apps Script page opens the external scanner.

The external scanner can then legitimately execute:

navigator.mediaDevices.getUserMedia()

because it is running as a normal HTTPS website rather than inside the restricted Apps Script HTMLService environment.

Google's own example specifically demonstrates this architecture and uses window.open() plus postMessage() to return camera data to Apps Script. 
G
Google for Developers
+1

Option B — Use html5-qrcode
For your particular application, I would seriously consider html5-qrcode.

It supports:

QR codes

1D barcodes

mobile cameras

desktop cameras

front/back camera selection

image/file scanning

camera permission handling

torch/flash on supported devices

configurable scanning region

JavaScript integration

The project explicitly documents mobile browser support and both camera and image scanning. 
G
GitHub
+1

html5-qrcode GitHub repository

Its scanner can request the rear camera with:

const html5QrCode = new Html5Qrcode("reader");

html5QrCode.start(
    { facingMode: "environment" },
    {
        fps: 10,
        qrbox: {
            width: 250,
            height: 250
        }
    },
    onScanSuccess
);

The library specifically documents facingMode: "environment" for using the back camera on mobile. 
G
GitHub

Very important: don't put that scanner back inside Apps Script
This is where I think many tutorials will send you in the wrong direction.

You may find tutorials saying:

<script src="html5-qrcode"></script>

and:

html5QrCode.start(...)

That doesn't solve the underlying Apps Script restriction.

The library ultimately needs access to:

navigator.mediaDevices.getUserMedia()

and Google's current documentation says Apps Script HTMLService restricts that API. 
G
Google for Developers

So:

Apps Script HTMLService
        ↓
html5-qrcode
        ↓
getUserMedia()
        ↓
❌ Permissions Policy

doesn't become:

Apps Script HTMLService
        ↓
html5-qrcode
        ↓
✅ camera

just because you changed the library.

What about allow="camera"?
You may see advice such as:

<iframe
    src="..."
    allow="camera">
</iframe>

This is a legitimate browser mechanism, but it isn't a magic fix for Apps Script.

The browser's Permissions Policy controls whether an iframe can access the camera, and both the parent policy and iframe policy can matter. A parent that has already prohibited camera access cannot be overridden by the child. 
M
MDN Web Docs
+1

And Google's own Apps Script troubleshooting page now specifically tells developers facing this problem to move the camera functionality outside Apps Script. 
G
Google for Developers

So I would not build your solution around trying to force:

allow="camera"

inside the Apps Script environment.

Where should the external scanner be hosted?
You have several possibilities.

1. GitHub Pages
Good for a simple static scanner.

Architecture:

GitHub Pages
      ↓
index.html
      ↓
html5-qrcode
      ↓
mobile camera
      ↓
QR result
      ↓
Apps Script
      ↓
Google Sheet

The scanner doesn't need a server if all QR decoding happens in JavaScript.

GitHub Pages documentation

This is particularly attractive if your scanner is just HTML/CSS/JavaScript.

2. Your own website/domain
If you already own a domain, this is probably the cleanest production solution.

For example:

app.example.com

could remain your main application while:

scanner.example.com

hosts the camera scanner.

Then:

scanner.example.com
        ↓
camera
        ↓
QR
        ↓
postMessage()
        ↓
app.example.com
        ↓
Apps Script
        ↓
Google Sheets

3. Firebase Hosting
Another reasonable option if you want a Google ecosystem solution.

You could host only the scanner frontend there while keeping:

Apps Script

Google Sheets

your existing business logic

exactly where they are.

How the communication should work
There are two main approaches.

Approach 1 — Return the QR value with postMessage
This is close to Google's own documented architecture. 
G
Google for Developers

Scanner:

window.opener.postMessage(
    {
        type: "QR_SCANNED",
        value: decodedText
    },
    "https://your-app-domain.example"
);

Main application:

window.addEventListener("message", function(event) {

    if (event.origin !== "https://your-scanner-domain.example") {
        return;
    }

    if (event.data?.type === "QR_SCANNED") {

        const value = event.data.value;

        google.script.run
            .processScannedCode(value);
    }
});

That gives you:

Mobile camera
      ↓
QR scanner
      ↓
decoded value
      ↓
postMessage
      ↓
Apps Script
      ↓
Google Sheet

Approach 2 — Scanner calls Apps Script directly
You could also have the scanner send the result to your Apps Script web-app endpoint.

For example:

Scanner
   ↓
POST/GET
   ↓
Apps Script
   ↓
Google Sheets

This can work, but you need to think carefully about authentication, authorization, CORS, duplicate submissions, and whether the Apps Script endpoint is public.

For an internal business application, I'd generally prefer the scanner returning the value to the already-authenticated application rather than making the scanner independently responsible for application authentication.

Security is important here
Don't blindly copy the Google example's:

window.addEventListener("message", function(event) {
    console.log(event.data);
});

into production.

Check:

event.origin

against the exact scanner origin.

For example:

if (event.origin !== "https://scanner.example.com") {
    return;
}

Google's example itself demonstrates checking the sender's origin before accepting the message. 
G
Google for Developers

Recommended scanner UI
For mobile, I would build the scanner approximately like this:

┌───────────────────────────┐
│       Scan QR Code        │
│                           │
│   ┌───────────────────┐   │
│   │                   │   │
│   │       CAMERA      │   │
│   │                   │   │
│   │   ─────────────   │   │
│   │                   │   │
│   └───────────────────┘   │
│                           │
│   Point camera at code    │
│                           │
│   [ 🔦 Flash ] [↻ Camera] │
│                           │
│   Or                      │
│                           │
│   [ Choose Image ]        │
│                           │
│   ✓ Result: ABC123        │
└───────────────────────────┘

I would provide both:

Live camera

Upload/take-photo fallback

because browser/device compatibility isn't perfect.

The html5-qrcode project explicitly supports both camera and file scanning, with the latter useful when inline camera access isn't available. 
G
GitHub

Android vs iPhone
You should test separately.

Android
Test:

Chrome

Samsung Internet

different Android versions

rear camera

permission denied → permission re-enable

camera already being used by another application

There are documented cases of Android/Samsung devices where camera initialization produces a black/inactive camera even after permission is granted, so a fallback is worthwhile. 
G
GitHub

iPhone
Test:

Safari

Chrome on iOS

iOS 17+

rear camera

permission changes

returning to the scanner after backgrounding the browser

There are also reported compatibility problems involving iOS and live scanning libraries, so don't assume Android behavior will automatically translate to iPhone. 
G
GitHub

Another important issue: HTTPS
The scanner page must be HTTPS for normal camera access.

Browser getUserMedia() requires a secure context. HTTP generally won't work; localhost is an exception for development. 
M
MDN Web Docs
+1

So don't deploy your scanner at:

http://scanner.example.com

Use:

https://scanner.example.com

Apps Script itself is HTTPS, so the problem isn't simply that your Apps Script URL isn't secure.

It's the sandbox/Permissions Policy.

What I would NOT recommend
I would avoid these approaches:

❌ Trying another QR library inside Apps Script
Changing:

html5-qrcode

to:

jsQR

or:

ZXing

doesn't remove the browser camera permission restriction.

The actual dependency is ultimately camera access through browser APIs.

❌ Trying to add random iframe permissions
Adding:

allow="camera"

is not sufficient if the surrounding Apps Script environment doesn't grant the required permission.

❌ Using Apps Script to process the camera stream
You don't need Apps Script involved in the actual video stream.

Keep the video entirely client-side.

❌ Uploading every camera frame to Google Sheets
Definitely don't do:

Camera
 ↓
Apps Script
 ↓
Google Sheets
 ↓
decode

The camera stream should remain in the browser.

Instead:

Camera
 ↓
JavaScript QR decoder
 ↓
ONE decoded string
 ↓
Apps Script
 ↓
Google Sheet

This is dramatically more efficient.

Your ideal architecture
Given what you've already built, I'd make the smallest possible change:

                    EXISTING APP
                 Google Apps Script
                         │
                         │
                 Google Sheets DB
                         ▲
                         │
                  decoded QR value
                         │
                  postMessage/API
                         │
             ┌───────────┴───────────┐
             │                       │
        Mobile scanner           Desktop scanner
             │                       │
       HTTPS webpage           HTTPS webpage
             │                       │
      html5-qrcode             html5-qrcode
             │                       │
        getUserMedia()         getUserMedia()
             │                       │
        Mobile camera           PC webcam

Your database and business logic don't need to move.

Only the camera UI needs to move outside Apps Script.

One particularly useful Google finding
This isn't merely a community workaround.

Google's own current Apps Script troubleshooting page gives essentially this solution:

Host the functionality requiring sensitive permissions on a separate domain outside Apps Script and open it in a new window/tab.

It even provides an example involving getUserMedia(), window.open(), postMessage(), and google.script.run. 
G
Google for Developers

That makes this significantly more reliable than trying to find a clever iframe workaround.

Libraries I'd consider
Library/approach	QR	Barcode	Mobile camera	Image fallback	My use
html5-qrcode	✅	✅	✅	✅	Strong candidate
Browser BarcodeDetector	✅*	✅*	✅	Requires own implementation	Advanced
jsQR	✅	❌ primarily QR	Requires own camera code	Can implement	QR-only
ZXing browser	✅	✅	✅	Possible	More control
Native phone camera	Depends	Depends	✅	N/A	Fallback only

*Browser support for BarcodeDetector varies, so I wouldn't make it the only mechanism.

For your requirement — QR + barcode + Android + iPhone + desktop + fallback image scanning — html5-qrcode is a particularly natural fit. Its documentation explicitly covers both camera and file scanning and provides mobile camera controls. 
G
GitHub
+1

The best practical solution for you
I would implement:

Main application
Keep:

Google Apps Script
+
Google Sheets
+
your existing HTML
+
your existing forms/business logic

New scanner
Create:

scanner.html

on an external HTTPS host.

Use:

html5-qrcode

with:

facingMode: "environment"

Then:

Scan QR
   ↓
Open scanner
   ↓
Request camera
   ↓
Rear camera
   ↓
Detect QR/barcode
   ↓
Return decoded value
   ↓
Close scanner
   ↓
Populate your existing input
   ↓
Apps Script
   ↓
Google Sheets

And keep:

📷 Live Camera

as the primary option and:

🖼️ Take Photo / Choose Image

as the fallback.

If you want, I can take this one step further
If you paste your current Code.gs and Index.html scanner code here, I can redesign it for your exact Apps Script application and give you the complete working architecture:

Apps Script Code.gs

existing Index.html modifications

separate mobile scanner.html

QR + barcode support

Android rear-camera support

iPhone/Safari handling

camera permission/error handling

flash/torch button where supported

photo-upload fallback

postMessage() communication back to Apps Script

automatic insertion of the scanned value into your existing form

Google Sheets save logic

duplicate-scan prevention

exact deployment/hosting steps

That would be much more useful than giving you another generic QR-scanner tutorial because the Google Apps Script camera restriction is the architectural part that needs to be changed. 
G
Google for Developers

Google's Apps Script camera/Permissions Policy troubleshooting
html5-qrcode project and documentation
MDN getUserMedia camera security documentation




G
G
M
Sources