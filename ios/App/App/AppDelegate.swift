import UIKit
import Capacitor
import Photos
import UniformTypeIdentifiers

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}

// Registers the app's own native plugin with the Capacitor bridge
// (Main.storyboard uses this controller).
class BridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(DeviceSyncPlugin())
    }
}

// Sync without picking: the whole photo library once access is allowed, and
// every file in one folder the person grants once (iOS lets no app read all
// files). Called from frontend/src/lib/deviceSync.ts.
@objc(DeviceSyncPlugin)
public class DeviceSyncPlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate {
    public let identifier = "DeviceSyncPlugin"
    public let jsName = "DeviceSync"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "photoAccess", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listPhotos", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "chooseFolder", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "folderStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listFolderFiles", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readFolderFile", returnType: CAPPluginReturnPromise),
    ]

    private let bookmarkKey = "DeviceSync.folderBookmark"
    private var pendingFolderCall: CAPPluginCall?
    private let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    @objc func photoAccess(_ call: CAPPluginCall) {
        PHPhotoLibrary.requestAuthorization(for: .readWrite) { status in
            switch status {
            case .authorized: call.resolve(["status": "full"])
            case .limited: call.resolve(["status": "limited"])
            default: call.resolve(["status": "denied"])
            }
        }
    }

    // after: oldest-first newer than that date; otherwise newest-first, older than before.
    @objc func listPhotos(_ call: CAPPluginCall) {
        let options = PHFetchOptions()
        options.fetchLimit = call.getInt("limit") ?? 25
        if let after = call.getString("after").flatMap({ iso.date(from: $0) }) {
            options.predicate = NSPredicate(format: "creationDate > %@", after as NSDate)
            options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: true)]
        } else {
            if let before = call.getString("before").flatMap({ iso.date(from: $0) }) {
                options.predicate = NSPredicate(format: "creationDate < %@", before as NSDate)
            }
            options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
        }
        DispatchQueue.global(qos: .utility).async {
            let assets = PHAsset.fetchAssets(with: .image, options: options)
            let request = PHImageRequestOptions()
            request.isSynchronous = true
            request.deliveryMode = .highQualityFormat
            request.resizeMode = .fast
            request.isNetworkAccessAllowed = true
            var photos: [[String: Any]] = []
            assets.enumerateObjects { asset, _, _ in
                guard let created = asset.creationDate else { return }
                var thumb = ""
                PHImageManager.default().requestImage(for: asset, targetSize: CGSize(width: 384, height: 384), contentMode: .aspectFit, options: request) { image, _ in
                    thumb = image?.jpegData(compressionQuality: 0.6)?.base64EncodedString() ?? ""
                }
                var row: [String: Any] = [
                    "id": asset.localIdentifier,
                    "takenAt": self.iso.string(from: created),
                    "width": asset.pixelWidth,
                    "height": asset.pixelHeight,
                    "favorite": asset.isFavorite,
                    "thumb": thumb,
                ]
                if let at = asset.location?.coordinate {
                    row["lat"] = at.latitude
                    row["lon"] = at.longitude
                }
                photos.append(row)
            }
            call.resolve(["photos": photos])
        }
    }

    @objc func chooseFolder(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.folder])
            picker.delegate = self
            self.pendingFolderCall = call
            self.bridge?.viewController?.present(picker, animated: true)
        }
    }

    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let call = pendingFolderCall, let url = urls.first else { return }
        pendingFolderCall = nil
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard let bookmark = try? url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil) else {
            call.reject("Couldn't keep access to that folder.")
            return
        }
        UserDefaults.standard.set(bookmark, forKey: bookmarkKey)
        call.resolve(["name": url.lastPathComponent])
    }

    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        pendingFolderCall?.reject("cancelled")
        pendingFolderCall = nil
    }

    private func folderURL() -> URL? {
        guard let data = UserDefaults.standard.data(forKey: bookmarkKey) else { return nil }
        var stale = false
        guard let url = try? URL(resolvingBookmarkData: data, options: [], relativeTo: nil, bookmarkDataIsStale: &stale) else { return nil }
        if stale, url.startAccessingSecurityScopedResource() {
            if let fresh = try? url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil) {
                UserDefaults.standard.set(fresh, forKey: bookmarkKey)
            }
            url.stopAccessingSecurityScopedResource()
        }
        return url
    }

    @objc func folderStatus(_ call: CAPPluginCall) {
        if let url = folderURL() { call.resolve(["name": url.lastPathComponent]) } else { call.resolve([:]) }
    }

    @objc func listFolderFiles(_ call: CAPPluginCall) {
        guard let root = folderURL() else { call.resolve(["files": []]); return }
        DispatchQueue.global(qos: .utility).async {
            let scoped = root.startAccessingSecurityScopedResource()
            defer { if scoped { root.stopAccessingSecurityScopedResource() } }
            let keys: [URLResourceKey] = [.isRegularFileKey, .fileSizeKey, .contentModificationDateKey]
            let walker = FileManager.default.enumerator(at: root, includingPropertiesForKeys: keys, options: [.skipsPackageDescendants])
            let rootPath = root.standardizedFileURL.path
            var files: [[String: Any]] = []
            while let found = walker?.nextObject() as? URL, files.count < 5000 {
                var url = found
                let name = found.lastPathComponent
                // An iCloud Drive file not yet on the phone is a hidden ".name.icloud" stub.
                if name.hasPrefix(".") {
                    guard name.hasSuffix(".icloud") else { walker?.skipDescendants(); continue }
                    url = found.deletingLastPathComponent().appendingPathComponent(String(name.dropFirst().dropLast(7)))
                }
                guard let values = try? found.resourceValues(forKeys: Set(keys)), values.isRegularFile == true else { continue }
                files.append([
                    "path": String(url.standardizedFileURL.path.dropFirst(rootPath.count + 1)),
                    "size": values.fileSize ?? 0,
                    "modified": self.iso.string(from: values.contentModificationDate ?? Date(timeIntervalSince1970: 0)),
                ])
            }
            call.resolve(["files": files])
        }
    }

    @objc func readFolderFile(_ call: CAPPluginCall) {
        guard let root = folderURL(), let path = call.getString("path") else { call.reject("No folder chosen"); return }
        let url = root.appendingPathComponent(path).standardizedFileURL
        guard url.path.hasPrefix(root.standardizedFileURL.path + "/") else { call.reject("Outside the chosen folder"); return }
        DispatchQueue.global(qos: .utility).async {
            let scoped = root.startAccessingSecurityScopedResource()
            defer { if scoped { root.stopAccessingSecurityScopedResource() } }
            var data: Data?
            var error: NSError?
            // Coordinated read downloads an iCloud Drive file that isn't on the phone yet.
            NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: &error) { data = try? Data(contentsOf: $0) }
            guard let data, data.count <= 10 * 1024 * 1024 else { call.reject("Couldn't read \(path)"); return }
            call.resolve(["data": data.base64EncodedString()])
        }
    }
}
