import Foundation
import Vision

let url = URL(fileURLWithPath: CommandLine.arguments[1])
let request = VNDetectBarcodesRequest()
request.symbologies = [.qr]
try VNImageRequestHandler(url: url).perform([request])
let payloads = request.results?.compactMap { $0.payloadStringValue } ?? []
for payload in payloads { print(payload) }
if !payloads.contains("https://snagbrag.example/spike/K7QF") { exit(1) }
