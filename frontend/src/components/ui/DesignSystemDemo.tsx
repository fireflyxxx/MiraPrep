"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";

/** A compact integration example for checking the shared component primitives. */
export function DesignSystemDemo() {
  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => toast.success("组件已准备就绪")}>显示通知</Button>
        <Dialog>
          <DialogTrigger render={<Button variant="outline" />}>
            打开示例弹窗
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>组件已连接</DialogTitle>
              <DialogDescription>弹窗支持键盘焦点与 Esc 关闭。</DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="loading">
        <TabsList>
          <TabsTrigger value="status">组件状态</TabsTrigger>
          <TabsTrigger value="loading">加载态</TabsTrigger>
        </TabsList>
        <TabsContent value="status">按钮、弹窗和通知已可用。</TabsContent>
        <TabsContent value="loading">
          <Skeleton data-testid="design-system-skeleton" className="h-8 w-full" />
        </TabsContent>
      </Tabs>

      <div aria-label="通知区域">
        <Toaster />
      </div>
    </div>
  );
}
