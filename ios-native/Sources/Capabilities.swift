import AVFoundation
import CoreLocation
import SwiftUI
import UserNotifications

enum Permission: String, CaseIterable, Identifiable {
    case microphone, camera, location, notifications
    var id: String { rawValue }

    var title: String {
        switch self {
        case .microphone: return "Microphone"
        case .camera: return "Camera"
        case .location: return "Location"
        case .notifications: return "Notifications"
        }
    }

    var icon: String {
        switch self {
        case .microphone: return "mic"
        case .camera: return "camera"
        case .location: return "location"
        case .notifications: return "bell"
        }
    }
}

enum PermissionStatus { case granted, denied, notAsked }

// The real OS state of the four permissions the app can use; a tap asks, or
// opens Settings once the person has said no.
@MainActor
final class PermissionCenter: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published private(set) var status: [Permission: PermissionStatus] = [:]
    private let location = CLLocationManager()

    override init() {
        super.init()
        location.delegate = self
    }

    func refresh() async {
        let notifications = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
        let microphone: PermissionStatus
        switch AVAudioApplication.shared.recordPermission {
        case .granted: microphone = .granted
        case .denied: microphone = .denied
        default: microphone = .notAsked
        }
        let camera: PermissionStatus
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: camera = .granted
        case .notDetermined: camera = .notAsked
        default: camera = .denied
        }
        let place: PermissionStatus
        switch location.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse: place = .granted
        case .notDetermined: place = .notAsked
        default: place = .denied
        }
        let alerts: PermissionStatus
        switch notifications {
        case .authorized, .provisional, .ephemeral: alerts = .granted
        case .notDetermined: alerts = .notAsked
        default: alerts = .denied
        }
        status = [.microphone: microphone, .camera: camera, .location: place, .notifications: alerts]
    }

    func tap(_ permission: Permission) async {
        switch status[permission] ?? .notAsked {
        case .notAsked:
            switch permission {
            case .microphone: _ = await AVAudioApplication.requestRecordPermission()
            case .camera: _ = await AVCaptureDevice.requestAccess(for: .video)
            case .location: location.requestWhenInUseAuthorization()
            case .notifications: _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
            }
            await refresh()
        case .denied:
            if let url = URL(string: UIApplication.openSettingsURLString) { await UIApplication.shared.open(url) }
        case .granted:
            break
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor in await self.refresh() }
    }
}

struct PermissionTiles: View {
    @StateObject private var center = PermissionCenter()
    @Environment(\.scenePhase) private var phase

    var body: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible())], spacing: 10) {
            ForEach(Permission.allCases) { permission in
                let state = center.status[permission] ?? .notAsked
                Button { Task { await center.tap(permission) } } label: {
                    VStack(alignment: .leading, spacing: 6) {
                        Image(systemName: permission.icon).font(.system(size: 18)).foregroundStyle(Theme.blue)
                        Text(permission.title).font(.system(size: 14, weight: .semibold))
                        Text(state == .granted ? "Allowed" : state == .denied ? "Off. Tap for Settings" : "Tap to allow")
                            .font(.system(size: 12))
                            .foregroundStyle(state == .granted ? Theme.green : state == .denied ? Theme.red : Theme.amber)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12)
                    .background(Theme.surface.opacity(0.7), in: RoundedRectangle(cornerRadius: 12))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.border))
                }
                .buttonStyle(.plain)
            }
        }
        .task { await center.refresh() }
        .onChange(of: phase) { _, new in
            if new == .active { Task { await center.refresh() } }
        }
    }
}

struct CapabilityGroup: Identifiable {
    let name: String
    let items: [Capability]
    var id: String { name }

    /// Groups in the order the site lists them.
    static func grouping(_ capabilities: [Capability]) -> [CapabilityGroup] {
        var order: [String] = []
        for capability in capabilities where !order.contains(capability.group) { order.append(capability.group) }
        return order.map { name in CapabilityGroup(name: name, items: capabilities.filter { $0.group == name }) }
    }
}

struct CapabilitiesView: View {
    @ObservedObject private var catalog = Catalog.shared

    private static let permissionIcons = ["mic": "mic", "cam": "camera", "loc": "location", "notif": "bell", "key": "key"]
    private static let permissionNames = ["mic": "Microphone", "cam": "Camera", "loc": "Location", "notif": "Notifications", "key": "API key"]

    var body: some View {
        List {
            if let capabilities = catalog.data?.capabilities {
                Section {
                    HStack {
                        count("live", capabilities, Theme.green)
                        count("partial", capabilities, Theme.amber)
                        count("planned", capabilities, Theme.muted)
                    }
                }
                .listRowBackground(Theme.surface.opacity(0.7))
                Section("Permissions") {
                    PermissionTiles()
                        .listRowBackground(Color.clear)
                        .listRowInsets(EdgeInsets())
                }
                ForEach(CapabilityGroup.grouping(capabilities)) { group in
                    Section(group.name) {
                        ForEach(group.items) { capability in row(capability) }
                            .listRowBackground(Theme.surface.opacity(0.7))
                    }
                }
            } else if let error = catalog.error {
                Text(error).foregroundStyle(Theme.red).font(.system(size: 13))
            }
        }
        .scrollContentBackground(.hidden)
        .background(Starfield())
        .navigationTitle("Capabilities")
        .refreshable { await catalog.load(force: true) }
        .task { await catalog.load() }
        .overlay { if catalog.data == nil && catalog.error == nil { ProgressView() } }
    }

    private func count(_ status: String, _ capabilities: [Capability], _ color: Color) -> some View {
        VStack(spacing: 2) {
            Text("\(capabilities.filter { $0.status == status }.count)").font(.system(size: 24, weight: .bold)).foregroundStyle(color)
            Text(status.capitalized).font(.system(size: 12)).foregroundStyle(Theme.muted)
        }
        .frame(maxWidth: .infinity)
    }

    private func row(_ capability: Capability) -> some View {
        let color = capability.status == "live" ? Theme.green : capability.status == "partial" ? Theme.amber : Theme.muted
        return VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Text(capability.name).font(.system(size: 15, weight: .medium))
                if capability.premium == true { Badge(text: "Premium", color: Theme.violet) }
                Spacer()
                Badge(text: capability.status.capitalized, color: color)
            }
            Text(capability.blurb).font(.system(size: 12)).foregroundStyle(Theme.muted)
            if !capability.required.isEmpty {
                HStack(spacing: 10) {
                    ForEach(capability.required, id: \.self) { code in
                        Image(systemName: Self.permissionIcons[code] ?? "questionmark")
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.secondary)
                            .accessibilityLabel("Needs \(Self.permissionNames[code] ?? code)")
                    }
                }
            }
        }
        .padding(.vertical, 2)
    }
}
