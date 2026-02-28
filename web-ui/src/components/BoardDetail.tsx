import { useState, useCallback, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { createTask, getBoardWithColumnsAndTasks, moveTask } from "../services/api";
import Column from "./Column";
import TaskDetail from "./TaskDetail";
import { DragAndDropProvider } from "../contexts/DragAndDropContext";
import { useNotifications } from "./NotificationContainer";

export default function BoardDetail() {
  const { boardId } = useParams<{ boardId: string }>();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const queryClient = useQueryClient();
  const notifications = useNotifications();

  const { data, isLoading, error } = useQuery({
    queryKey: ["board", boardId],
    queryFn: () => (boardId ? getBoardWithColumnsAndTasks(boardId) : null),
    enabled: !!boardId,
  });

  const handleTaskClick = (taskId: string) => {
    setSelectedTaskId(taskId);
  };

  const handleCloseTaskDetail = () => {
    setSelectedTaskId(null);
  };

  const createTaskMutation = useMutation({
    mutationFn: ({ title, content }: { title: string; content: string }) => {
      if (!boardId) throw new Error("Missing boardId");
      return createTask(boardId, title, content, "USER");
    },
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ["board", boardId] });
      setIsCreating(false);
      setNewTitle("");
      setNewContent("");
      if (res?.task?.id) setSelectedTaskId(res.task.id);
      notifications.success("Task created", "New task added to the board");
    },
    onError: (err) => {
      notifications.error(
        "Failed to create task",
        err instanceof Error ? err.message : "Unknown error"
      );
    },
  });

  // Find the current column and task index
  const currentColumnAndTaskIndex = useMemo(() => {
    if (!selectedTaskId || !data?.columns) return null;

    for (const column of data.columns) {
      const taskIndex = column.tasks.findIndex(
        (task) => task.id === selectedTaskId
      );
      if (taskIndex !== -1) {
        return { column, taskIndex };
      }
    }
    return null;
  }, [selectedTaskId, data?.columns]);

  // Navigate to previous task in the same column
  const handlePrevTask = useCallback(() => {
    if (!currentColumnAndTaskIndex) return;

    const { column, taskIndex } = currentColumnAndTaskIndex;
    if (taskIndex > 0) {
      setSelectedTaskId(column.tasks[taskIndex - 1].id);
    }
  }, [currentColumnAndTaskIndex]);

  // Navigate to next task in the same column
  const handleNextTask = useCallback(() => {
    if (!currentColumnAndTaskIndex) return;

    const { column, taskIndex } = currentColumnAndTaskIndex;
    if (taskIndex < column.tasks.length - 1) {
      setSelectedTaskId(column.tasks[taskIndex + 1].id);
    }
  }, [currentColumnAndTaskIndex]);

  // Check if there are previous or next tasks available
  const hasPrevTask = useMemo(() => {
    return currentColumnAndTaskIndex
      ? currentColumnAndTaskIndex.taskIndex > 0
      : false;
  }, [currentColumnAndTaskIndex]);

  const hasNextTask = useMemo(() => {
    if (!currentColumnAndTaskIndex) return false;
    const { column, taskIndex } = currentColumnAndTaskIndex;
    return taskIndex < column.tasks.length - 1;
  }, [currentColumnAndTaskIndex]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  // Handle moving a task between columns
  const handleMoveTask = async (
    taskId: string,
    _sourceColumnId: string,
    destinationColumnId: string
  ) => {
    try {
      // Perform the actual API call
      await moveTask(taskId, destinationColumnId);

      // Invalidate the query to refetch the board data
      await queryClient.invalidateQueries({ queryKey: ["board", boardId] });
    } catch (error) {
      console.error("Failed to move task:", error);

      // Show detailed error message
      if (error instanceof Error) {
        if (error.message.includes("capacity limit")) {
          notifications.error(
            "Column capacity limit reached",
            "This column has reached its maximum capacity. Complete or move existing tasks before adding new ones."
          );
        } else {
          notifications.error("Failed to move task", error.message);
        }
      } else {
        notifications.error(
          "Failed to move task",
          "An unexpected error occurred while moving the task."
        );
      }

      // Refetch to ensure UI is in sync with server state
      queryClient.invalidateQueries({ queryKey: ["board", boardId] });

      return Promise.reject(error);
    }
  };

  if (error || !data) {
    return (
      <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg
              className="h-5 w-5 text-red-400"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="ml-3">
            <p className="text-sm text-red-700">
              Error loading board:{" "}
              {error instanceof Error ? error.message : "Board not found"}
            </p>
            <div className="mt-2">
              <Link
                to="/boards"
                className="text-sm font-medium text-red-700 hover:text-red-600"
              >
                Go back to boards list
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { board, columns } = data;

  return (
    <div>
      <div className="mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{board.name}</h2>
            <p className="mt-1 text-base text-gray-700">{board.goal}</p>
          </div>
          <div className="ml-6 flex gap-2">
            <button
              type="button"
              onClick={() => setIsCreating(true)}
              className="rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white whitespace-nowrap shadow-sm hover:bg-gray-800"
            >
              New task
            </button>
            <Link
              to="/boards"
              className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white whitespace-nowrap shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              Back to Boards
            </Link>
          </div>
        </div>
      </div>

      {isCreating && (
        <div className="mb-6 rounded-md border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-900">Create new task</h3>
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Cancel
            </button>
          </div>
          <div className="mt-3 grid gap-3">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Title"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Content (markdown)"
              className="w-full h-40 rounded-md border border-gray-300 px-3 py-2 text-sm font-mono"
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => createTaskMutation.mutate({ title: newTitle, content: newContent })}
                disabled={!newTitle.trim() || createTaskMutation.isPending}
                className="rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-800 disabled:opacity-50"
              >
                {createTaskMutation.isPending ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-visible pb-6">
        <DragAndDropProvider onMoveTask={handleMoveTask}>
          <div className="flex gap-4 min-w-max">
            {columns.map((column) => (
              <div key={column.id} className="w-[280px]">
                <Column column={column} onTaskClick={handleTaskClick} />
              </div>
            ))}
          </div>
        </DragAndDropProvider>
      </div>

      <TaskDetail
        taskId={selectedTaskId}
        onClose={handleCloseTaskDetail}
        onPrevTask={handlePrevTask}
        onNextTask={handleNextTask}
        hasPrevTask={hasPrevTask}
        hasNextTask={hasNextTask}
      />
    </div>
  );
}
