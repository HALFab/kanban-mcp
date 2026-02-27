import React, { useState, useEffect } from 'react';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { XMarkIcon, ChevronLeftIcon, ChevronRightIcon, PencilIcon } from '@heroicons/react/24/outline';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTaskById, setTaskAssignee, updateTask } from '../services/api';
import MarkdownRenderer from './MarkdownRenderer';
import { Assignee } from '../types';

interface TaskDetailProps {
  taskId: string | null;
  onClose: () => void;
  onPrevTask?: () => void;
  onNextTask?: () => void;
  hasPrevTask?: boolean;
  hasNextTask?: boolean;
}

export default function TaskDetail({ 
  taskId, 
  onClose, 
  onPrevTask, 
  onNextTask, 
  hasPrevTask = false, 
  hasNextTask = false 
}: TaskDetailProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const queryClient = useQueryClient();

  const { data: task, isLoading, error } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => (taskId ? getTaskById(taskId) : null),
    enabled: !!taskId,
  });

  // Set edit content when task data is loaded
  useEffect(() => {
    if (task) {
      setEditContent(task.content);
    }
  }, [task]);

  const updateTaskMutation = useMutation({
    mutationFn: ({ taskId, content }: { taskId: string; content: string }) => 
      updateTask(taskId, content),
    onSuccess: () => {
      // Invalidate and refetch the task query to update the UI
      queryClient.invalidateQueries({ queryKey: ['task', taskId] as const });
      setIsEditing(false);
    }
  });

  const setAssigneeMutation = useMutation({
    mutationFn: ({ taskId, assignee, reason }: { taskId: string; assignee: Assignee; reason?: string }) =>
      setTaskAssignee(taskId, assignee, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', taskId] as const });
      // Board list data includes summaries; refresh so badges/filters update.
      queryClient.invalidateQueries({ queryKey: ['board'] });
    },
  });

  const handleEditClick = () => {
    setIsEditing(true);
  };

  const handleSaveClick = () => {
    if (taskId) {
      updateTaskMutation.mutate({ taskId, content: editContent });
    }
  };

  const handleCancelClick = () => {
    if (task) {
      setEditContent(task.content);
    }
    setIsEditing(false);
  };

  if (!taskId) return null;

  return (
    <Dialog open={!!taskId} onClose={onClose} className="relative z-10">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />

      <div className="fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10 sm:pl-16">
            <DialogPanel className="pointer-events-auto w-screen max-w-2xl transform transition duration-500 ease-in-out">
              <div className="flex h-full flex-col overflow-y-scroll bg-white py-6 shadow-xl">
                <div className="px-4 sm:px-6">
                  <div className="flex items-start justify-between">
                    <DialogTitle className="text-base font-semibold text-gray-900">
                      {isLoading ? 'Loading...' : error ? 'Error loading task' : task?.title}
                    </DialogTitle>
                    <div className="ml-3 flex h-7 items-center space-x-2">
                      {!isEditing && task && (
                        <button
                          type="button"
                          onClick={handleEditClick}
                          className="relative rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                          aria-label="Edit task"
                        >
                          <span className="absolute -inset-2.5" />
                          <PencilIcon className="h-5 w-5" aria-hidden="true" />
                        </button>
                      )}
                      {onPrevTask && !isEditing && (
                        <button
                          type="button"
                          onClick={onPrevTask}
                          disabled={!hasPrevTask}
                          className="relative rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                          aria-label="Previous task"
                        >
                          <span className="absolute -inset-2.5" />
                          <ChevronLeftIcon className="h-5 w-5" aria-hidden="true" />
                        </button>
                      )}
                      {onNextTask && !isEditing && (
                        <button
                          type="button"
                          onClick={onNextTask}
                          disabled={!hasNextTask}
                          className="relative rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                          aria-label="Next task"
                        >
                          <span className="absolute -inset-2.5" />
                          <ChevronRightIcon className="h-5 w-5" aria-hidden="true" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={isEditing ? handleCancelClick : onClose}
                        className="relative rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                      >
                        <span className="absolute -inset-2.5" />
                        <span className="sr-only">Close panel</span>
                        <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="relative mt-4 flex-1 px-4 sm:px-6">
                  {isLoading ? (
                    <div className="flex justify-center items-center h-64">
                      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
                    </div>
                  ) : error ? (
                    <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-4">
                      <div className="flex">
                        <div className="ml-3">
                          <p className="text-sm text-red-700">
                            Error loading task: {error instanceof Error ? error.message : 'Unknown error'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : task ? (
                    <div className="space-y-6 flex flex-col gap-4">
                      {isEditing ? (
                        <div className="flex flex-col gap-4">
                          <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="w-full h-64 p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono"
                          />
                          <div className="flex justify-end space-x-2">
                            <button
                              type="button"
                              onClick={handleCancelClick}
                              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={handleSaveClick}
                              disabled={updateTaskMutation.isPending}
                              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {updateTaskMutation.isPending ? 'Saving...' : 'Save'}
                            </button>
                          </div>
                          {updateTaskMutation.isError && (
                            <div className="bg-red-50 border-l-4 border-red-400 p-4 mt-2">
                              <div className="flex">
                                <div className="ml-3">
                                  <p className="text-sm text-red-700">
                                    Error updating task: {updateTaskMutation.error instanceof Error ? updateTaskMutation.error.message : 'Unknown error'}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <MarkdownRenderer 
                            content={task.content} 
                            className="mt-2 text-sm text-gray-900" 
                          />
                        </div>
                      )}
                      <div>
                        <h3 className="text-base font-medium text-gray-600">Details</h3>
                        <dl className="mt-2 divide-y divide-gray-200 border-t border-b border-gray-200">
                          <div className="flex justify-between py-3 text-sm items-center">
                            <dt className="text-gray-500">Assignee</dt>
                            <dd className="text-gray-900">
                              <select
                                value={task.assignee}
                                onChange={(e) => {
                                  const next = e.target.value as Assignee;
                                  setAssigneeMutation.mutate({
                                    taskId: task.id,
                                    assignee: next,
                                    reason:
                                      next === 'AGENT'
                                        ? 'Assigned to agent for action'
                                        : 'Handed back to user',
                                  });
                                }}
                                disabled={setAssigneeMutation.isPending}
                                className="border border-gray-300 rounded-md px-2 py-1 text-sm bg-white"
                              >
                                <option value="USER">USER</option>
                                <option value="AGENT">AGENT</option>
                              </select>
                            </dd>
                          </div>
                          <div className="flex justify-between py-3 text-sm">
                            <dt className="text-gray-500">Created</dt>
                            <dd className="text-gray-900">{new Date(task.created_at).toLocaleString()}</dd>
                          </div>
                          <div className="flex justify-between py-3 text-sm">
                            <dt className="text-gray-500">Updated</dt>
                            <dd className="text-gray-900">{new Date(task.updated_at).toLocaleString()}</dd>
                          </div>
                          {task.update_reason && (
                            <div className="flex flex-col justify-between py-3 text-sm">
                              <dt className="text-gray-500">Update Reason</dt>
                              <dd className="text-gray-900">{task.update_reason}</dd>
                            </div>
                          )}
                        </dl>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </DialogPanel>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
