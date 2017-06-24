![Screenshot of MacPaint showing the 'woodblock' demo image](/files/macpaint-woodblock_0.png)

The [Internet Archive](https://archive.org) recently added the original Macintosh to the list of classic computers of which they provide emulation, so you can play with the software titles in their archive [in your browser](https://archive.org/details/softwarelibrary_mac), without installing anything. This is great because it provides the same level of accessibility and convenience to emulation as you'd expect of playing a media file or viewing a document.

When you start up the emulated computer on these pages of the Internet Archive, you're running the [PCE](http://hampa.ch/pce/) emulator, originally a piece of software intended to run natively on desktop operating systems, which has been adapted and recompiled to run in your web browser. As the person who did the initial work of porting this emulator, I thought it would be worthwhile to provide a run-down of the tools and gross hacks which made this possible.

Firstly, I got the emulator's C codebase to compile to ASM.js-compatible Javascript using [Emscripten](https://kripken.github.io/emscripten-site/). This involved adjusting the project's GNU Autotools-based build system to use Emscripten's emcc compiler executable instead of gcc. Emscripten's wrapper for Autotools' configure, called emconfigure, does most of the work here. Emscripten also handles the mapping of native APIs to browser equivalents, so SDL rendering calls become Canvas API calls, browser input events become SDL events, etc.

Once the code compiled successfully and was able to start up in the browser without crashing, the next issue to deal with was 'yielding' to the browser event loop. In modern operating systems, native programs can run as one unbroken thread of execution. The program can rely on the operating system to manage the program's usage of the CPU, interrupting it periodically so that other programs can do some work. The program doesn't need to know when this will happen or do anything special to enable it. We call this 'preemptive multitasking'. However, Javascript code running in the web browser can't just run indefinitely, it must regularly yield control back to the browser so that I/O can be performed (updating the screen, triggering mouse and keyboard event handlers, etc). So I had to break the control flow of the emulator code up, so that it could a 'chunk' of work, and then allow the browser to do it's thing before the next chunk of work. You could draw a comparison between this and a 'cooperative multitasking' operating system.

The way I achieved this was pretty blunt, but it worked. The emulator initializes normally, and then instead of running the emulated system in an infinite loop, [it provides the Emscripten runtime with a callback function](https://github.com/jsdf/pce/blob/6dee9246bf6cd265e3796a849d352aa4ef798037/src/arch/macplus/cmd_68k.c#L416) which, when called, will [run a few clock cycles of the emulated computer's CPU](https://github.com/jsdf/pce/blob/6dee9246bf6cd265e3796a849d352aa4ef798037/src/arch/macplus/cmd_68k.c#L443). By 'a few', I mean a few thousand. Emscripten calls this callback many times a second. Ideally we could yield back to the browser after every cycle of the CPU, so that we could collect the latest inputs from the mouse and keyboard, and update the screen if necessary, but there are limits on how often the browser can process chunks of Javascript work in its event loop (enqueued via a browser API call such as setTimeout or requestAnimationFrame) which mean that to achieve reasonable performance of the emulator we need to run a bunch of cycles for each yield. I hand-tuned this, and found that ~10000 cycles per yield gives a decent balance of speed and responsiveness of the emulator.

Finally, there was the issue of mouse pointer integration. At this point, moving your mouse around the browser window resulted in the relative mouse movements being passed to the emulator, which in turn are provided to Mac OS as emulated hardware mouse movements. Mac OS moves the mouse in on the emulator's screen, but it's not necessarily in the same place as your OS' real mouse pointer. I felt I could do better, so I added a super gross hack to actually update the emulated Mac OS mouse position to match your real mouse cursor's position on the screen. You can see that happening [here](https://github.com/jsdf/pce/blob/6dee9246bf6cd265e3796a849d352aa4ef798037/src/arch/macplus/cmd_68k.c#L446-L458). I realised that in classic Mac OS, the mouse position is stored in a few fixed absolute locations in the computer's memory, called 'low memory globals'. Basically, I directly write the mouse position value into the emulated computer's memory. Gross, right? But it works great, as you can see by [drawing some stuff in Kid Pix](https://jamesfriend.com.au/pce-js/). The mouse responds perfectly. You can read more about low memory globals in [this folklore.org story](http://www.folklore.org/StoryView.py?story=Mea_Culpa.txt).

I'm really glad Classic Mac emulation made its way onto archive.org, because I think everybody should have the opportunity to experience computing history, and the original Macintosh is an essential piece of that history.

If you're wondering about my rationale for porting emulators to the browser, have a read of [my previous post on the subject](https://jamesfriend.com.au/why-port-emulators-browser).