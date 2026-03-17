# 在线预约系统说明

## 本地启动

1. 进入当前目录
2. 运行 `npm start`
3. 打开 `http://localhost:3000`

默认后台密码是 `878888`。如果要改密码，启动前设置环境变量：

```powershell
$env:ADMIN_PASSWORD = "你的新密码"
npm start
```

## 现在这套在线版做了什么

- 页面通过 `/api` 读取共享预约数据
- 用户提交的预约会保存到 `data/bookings.json`
- “我的预约” 只显示当前设备提交过的记录
- 顶部 `Reserve` 连点 5 次后，输入后台密码可以审核全部预约
- 审核结果会自动同步回用户页面

## 部署建议

- 这套代码可以直接部署到支持 Node.js 的平台
- 推荐把 `ADMIN_PASSWORD` 配成平台环境变量，不要长期使用默认值
- `data/bookings.json` 需要放在有持久化磁盘的环境，否则重启后数据会丢失
- 现在支持用 `DATA_DIR` 或 `DATA_FILE` 指定云端数据盘路径
