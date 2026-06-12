import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const viPath = path.join(__dirname, '../static/app/locales/vi-VN.json');
const vi = JSON.parse(fs.readFileSync(viPath, 'utf8'));

Object.assign(vi, {
    'plugins.uninstallTitle': 'Gỡ plugin',
    'plugins.market.indexUpdated': 'Đã cập nhật chỉ mục chợ từ xa',
    'plugins.market.loadFailed': 'Tải chợ plugin thất bại',
    'plugins.market.updateTo': 'Cập nhật lên v{version}',
    'plugins.install': 'Cài đặt',
    'plugins.paid': 'Trả phí',
    'plugins.paidPlugin': 'Plugin trả phí',
    'plugins.payment.buyTitle': 'Mua plugin: {name}',
    'plugins.installing': 'Đang cài đặt...',
    'plugins.installSuccess': 'Plugin {name} đã cài thành công',
    'plugins.installFailed': 'Cài đặt thất bại',
    'plugins.uninstall.confirm': 'Bạn có chắc muốn gỡ plugin "{name}"?\nCảnh báo: Thao tác này sẽ xóa vĩnh viễn thư mục plugin và toàn bộ cấu hình. Hãy sao lưu dữ liệu plugin trước!',
    'plugins.uninstall.success': 'Plugin {name} đã gỡ thành công',
    'plugins.uninstall.failed': 'Gỡ bỏ thất bại',
    'plugins.restart.hint': 'Vui lòng khởi động lại dịch vụ để thay đổi có hiệu lực',
    'upload.quickLinkTitle': 'Liên kết nhanh đến {name}',
    'upload.fileSize': 'Kích thước file',
    'upload.lastModified': 'Lần sửa đổi cuối',
    'upload.batchLinkSummary': '{name}: {count}',
    'common.downloadFailed': 'Tải xuống thất bại',
    'playground.uploadImageFirst': 'Vui lòng tải lên ảnh cần chỉnh sửa trước',
    'playground.attachment': '[Đính kèm: {name}]',
    'playground.imageTag': '[Hình ảnh]',
    'playground.copyText': 'Sao chép văn bản',
    'playground.retryChat': 'Thử lại cuộc hội thoại',
    'modal.provider.loadModelsFailed': 'Tải danh sách model thất bại',
    'modal.provider.toggleTitle': '{action} nhà cung cấp này',
    'modal.uploadFile': 'Tải lên file',
    'common.unknown': 'Không xác định',
    'customModels.deleteModel': 'Xóa model',
    'modal.provider.concurrencyPlaceholder': 'Tối đa đồng thời, mặc định 0 = không giới hạn',
    'modal.provider.queuePlaceholder': 'Hàng đợi tối đa, mặc định 0 = không giới hạn',
    'plugins.market.urlPlaceholder': 'Nhập URL market.json từ xa (tùy chọn)',
    'config.healthCheck.5min': '5 phút',
    'config.healthCheck.10min': '10 phút',
    'config.healthCheck.30min': '30 phút',
    'config.healthCheck.msPlaceholder': 'mili giây',
    'customModels.emptyHint': 'Nhấn nút "Thêm model" để bắt đầu tạo',
});

delete vi['language.switched.zh'];
fs.writeFileSync(viPath, JSON.stringify(vi, null, 2) + '\n');
console.log('keys:', Object.keys(vi).length);
