/** Spring Boot 业务接口统一返回的外层结构。 */
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

/** 所有列表接口使用的分页结构。 */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

/**
 * 让页面能同时拿到业务错误码、用户可读消息和 HTTP 状态码的错误对象。
 */
export class ApiError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
