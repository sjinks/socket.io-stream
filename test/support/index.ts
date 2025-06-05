import { io, Socket, type ManagerOptions, type SocketOptions } from 'socket.io-client';

export function client(port: number, options: Partial<ManagerOptions & SocketOptions> = {}): Socket {
  options = options || {};

  const _options: Partial<ManagerOptions & SocketOptions> = {
    forceNew: true,
    ...options
  };

  return io(`http://localhost:${port}`, _options);
}
