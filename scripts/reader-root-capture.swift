// Capture the App window and require visible text from the acceptance PDF.
// A live process or a nonempty PNG alone can still conceal a blank reader.
import AppKit
import Foundation
import ImageIO
import ScreenCaptureKit
import Vision

guard CommandLine.arguments.count == 5,
      let pid = Int32(CommandLine.arguments[1]) else {
    exit(2)
}
let expectedTitle = CommandLine.arguments[2]
let output = URL(fileURLWithPath: CommandLine.arguments[3])
let expectedChapter = CommandLine.arguments[4]

// ScreenCaptureKit's window filter needs a CoreGraphics app context.
_ = NSApplication.shared
DispatchQueue.main.asyncAfter(deadline: .now() + 20) {
    fputs("App window capture timed out\n", stderr)
    exit(1)
}

Task {
    do {
        let content = try await SCShareableContent.excludingDesktopWindows(
            false, onScreenWindowsOnly: false
        )
        let ownedWindows = content.windows.filter { $0.owningApplication?.processID == pid }
        guard let window = ownedWindows
            .filter({ $0.title?.contains(expectedTitle) == true })
            .max(by: { $0.frame.width * $0.frame.height < $1.frame.width * $1.frame.height }) else {
            let titles = ownedWindows.map { $0.title ?? "<untitled>" }.joined(separator: ", ")
            fputs("App document window not found (pid=\(pid), windows=[\(titles)])\n", stderr)
            exit(1)
        }
        let filter = SCContentFilter(desktopIndependentWindow: window)
        let configuration = SCStreamConfiguration()
        configuration.width = Int(window.frame.width * 2)
        configuration.height = Int(window.frame.height * 2)
        let image = try await SCScreenshotManager.captureImage(
            contentFilter: filter, configuration: configuration
        )

        guard let destination = CGImageDestinationCreateWithURL(
            output as CFURL, "public.png" as CFString, 1, nil
        ) else { exit(1) }
        CGImageDestinationAddImage(destination, image, nil)
        guard CGImageDestinationFinalize(destination) else { exit(1) }

        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.recognitionLanguages = ["zh-Hans", "en-US"]
        try VNImageRequestHandler(cgImage: image).perform([request])
        let text = (request.results ?? [])
            .compactMap { $0.topCandidates(1).first?.string }
            .joined(separator: " ")
        print("Observed document OCR: \(text)")
        try text.write(to: output.appendingPathExtension("txt"), atomically: true, encoding: .utf8)
        guard text.contains("VibeReader"), text.contains(expectedChapter) else {
            fputs("App capture does not show the acceptance PDF text\n", stderr)
            exit(1)
        }

        exit(0)
    } catch {
        fputs("App window capture failed: \(error)\n", stderr)
        exit(1)
    }
}
RunLoop.main.run()
