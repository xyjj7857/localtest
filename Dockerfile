# 第一阶段：编译阶段 (Build Stage)
FROM node:20-slim AS builder

WORKDIR /app

# 复制 package.json 和 lock 文件安装依赖
COPY package*.json ./
RUN npm install

# 复制所有源代码
COPY . .

# 编译前端静态资源 (生成 dist 目录)
RUN npm run build

# 第二阶段：运行阶段 (Production Stage)
FROM node:20-slim

WORKDIR /app

# 复制运行所需的必要文件
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./
COPY --from=builder /app/node_modules ./node_modules

# 安装 tsx 以便直接运行 typescript 后端 (或者你可以选择先编译 server.ts)
RUN npm install -g tsx

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3000

# 暴露端口
EXPOSE 3000

# 启动全栈服务
CMD ["tsx", "server.ts"]
