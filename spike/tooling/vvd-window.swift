// macOS 15+: capture the single VVD window, never the desktop or emulator GL buffer.
import Foundation
import AppKit
import ScreenCaptureKit
import AVFoundation
import ImageIO
import UniformTypeIdentifiers

struct CaptureError: Error, CustomStringConvertible { let description: String }
func json(_ value: [String: Any], to path: String) throws {
    try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]).write(to: URL(fileURLWithPath: path), options: .atomic)
}
@available(macOS 15.0, *)
final class FrameWriter: NSObject, SCStreamOutput {
    let writer: AVAssetWriter; let input: AVAssetWriterInput; let pixels: AVAssetWriterInputPixelBufferAdaptor
    let job: String; let metadata: [String: Any]; let fps: Int32
    var first: CMTime?; var last = CMTime.zero; var frames = 0
    init(output: String, job: String, metadata: [String: Any], fps: Int32, bitrate: Int) throws {
        self.job = job; self.metadata = metadata; self.fps = fps
        writer = try AVAssetWriter(outputURL: URL(fileURLWithPath: output), fileType: .mp4)
        input = AVAssetWriterInput(mediaType: .video, outputSettings: [AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: 1920, AVVideoHeightKey: 1080,
            AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: bitrate, AVVideoExpectedSourceFrameRateKey: fps]])
        input.expectsMediaDataInRealTime = true
        pixels = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: nil)
        super.init()
        writer.add(input)
        guard writer.startWriting() else { throw CaptureError(description: "Cannot start video writer") }
        writer.startSession(atSourceTime: .zero)
    }
    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen, sampleBuffer.isValid, input.isReadyForMoreMediaData,
            let attachments = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
            let status = attachments.first?[.status] as? Int, status == SCFrameStatus.complete.rawValue,
            let image = sampleBuffer.imageBuffer else { return }
        let pts = sampleBuffer.presentationTimeStamp
        if first == nil { first = pts }
        let time = CMTimeSubtract(pts, first!)
        if pixels.append(image, withPresentationTime: time) {
            last = time; frames += 1
            if frames == 1 { try? json(metadata, to: job + "/ready.json") }
        }
    }
    func finish() async throws {
        input.markAsFinished(); writer.endSession(atSourceTime: CMTimeAdd(last, CMTime(value: 1, timescale: fps)))
        await writer.finishWriting()
        guard writer.status == .completed, frames > 1 else { throw CaptureError(description: writer.error?.localizedDescription ?? "Window recorder produced no moving stream") }
        try json(metadata.merging(["pass": true, "sourceFrames": frames, "durationSeconds": last.seconds + 1 / Double(fps)]) { _, new in new }, to: job + "/done.json")
    }
}
@main
struct WindowCapture {
    @MainActor
    static func main() async {
        do {
            _ = NSApplication.shared
            guard #available(macOS 15.0, *) else { throw CaptureError(description: "VVD window capture needs macOS 15 or later") }
            try await capture()
        } catch {
            FileHandle.standardError.write(Data(("VVD window capture: \(error)\n").utf8)); exit(1)
        }
    }
    @available(macOS 15.0, *)
    static func capture() async throws {
        let args = Array(CommandLine.arguments.dropFirst())
        guard args.count >= 2 else { throw CaptureError(description: "Use screenshot output.png or record output.mp4 fps limit-seconds job-directory") }
        let content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: false)
        let windows = content.windows.filter { $0.owningApplication?.applicationName == "vega-virtual-device" && $0.title == "Vega Virtual Device" && $0.frame.width > 400 }
        guard windows.count == 1, let window = windows.first else {
            throw CaptureError(description: "Need exactly one windowed VVD. Start vega virtual-device start --gui=true --display-res 1920,1080; headless console pixels are not accepted.")
        }
        let stageHeight = window.frame.width * 9 / 16, chrome = window.frame.height - stageHeight
        guard chrome >= 20 && chrome <= 60 else { throw CaptureError(description: "VVD window is not the verified 16:9 stage with title bar") }
        let config = SCStreamConfiguration()
        config.width = 1920; config.height = 1080
        config.sourceRect = CGRect(x: 0, y: chrome, width: window.frame.width, height: stageHeight)
        config.scalesToFit = true; config.preservesAspectRatio = true
        config.showsCursor = false; config.capturesAudio = false
        config.ignoreShadowsSingleWindow = true; config.captureResolution = .best
        config.queueDepth = 3
        let filter = SCContentFilter(desktopIndependentWindow: window)
        let metadata: [String: Any] = ["source": "macOS ScreenCaptureKit single VVD window", "windowId": window.windowID,
            "width": 1920, "height": 1080, "cropTitleBarPoints": chrome, "audio": false]
        if args[0] == "screenshot" {
            let image = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)
            guard let destination = CGImageDestinationCreateWithURL(URL(fileURLWithPath: args[1]) as CFURL, UTType.png.identifier as CFString, 1, nil) else {
                throw CaptureError(description: "Cannot create PNG destination")
            }
            CGImageDestinationAddImage(destination, image, nil)
            guard CGImageDestinationFinalize(destination) else { throw CaptureError(description: "Cannot finish PNG") }
            try json(metadata, to: args[1] + ".capture.json")
        } else if args[0] == "record", args.count == 6, let fps = Int32(args[2]), let seconds = Double(args[3]), let bitrate = Int(args[5]), bitrate > 0, fps > 0 && fps <= 60, seconds > 0 && seconds <= 180 {
            config.minimumFrameInterval = CMTime(value: 1, timescale: fps)
            config.pixelFormat = kCVPixelFormatType_32BGRA
            let output = try FrameWriter(output: args[1], job: args[4], metadata: metadata.merging(["requestedFps": fps, "bitrate": bitrate]) { _, new in new }, fps: fps, bitrate: bitrate)
            let stream = SCStream(filter: filter, configuration: config, delegate: nil)
            let queue = DispatchQueue(label: "snag.capture.frames")
            try stream.addStreamOutput(output, type: .screen, sampleHandlerQueue: queue)
            try await stream.startCapture()
            let end = Date().addingTimeInterval(seconds)
            while Date() < end && !FileManager.default.fileExists(atPath: args[4] + "/stop") && !FileManager.default.fileExists(atPath: args[4] + "/done.json") {
                try await Task.sleep(nanoseconds: 100_000_000)
            }
            try await stream.stopCapture()
            await withCheckedContinuation { continuation in queue.async { continuation.resume() } }
            try await output.finish()
        } else { throw CaptureError(description: "Invalid capture arguments") }
    }
}
