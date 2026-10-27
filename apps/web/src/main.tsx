import "@/index.css";
import { httpStatusApi } from "@/lib/api-status";
import { createQueryClient } from "@/lib/query-client";
import { mountApp } from "@/mount";
import { createAppRouter } from "@/router";

const queryClient = createQueryClient();
const router = createAppRouter({ queryClient, api: httpStatusApi });

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root element");

void mountApp(root, { router, queryClient });
